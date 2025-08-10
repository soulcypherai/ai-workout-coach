import { authenticateSocket } from '../middleware/auth.js';
import communityFeedService from '../services/communityFeed.js';

export function setupFeedNamespace(io) {
  const feedNamespace = io.of('/feed');
  
  // Apply authentication middleware
  feedNamespace.use(authenticateSocket);

  feedNamespace.on('connection', (socket) => {
    console.log(`[Feed] User ${socket.userId} connected to feed namespace`);

    // Join post-specific room for real-time updates
    socket.on('join_post', (postId) => {
      socket.join(`post:${postId}`);
      console.log(`[Feed] User ${socket.userId} joined post room: ${postId}`);
    });

    // Leave post-specific room
    socket.on('leave_post', (postId) => {
      socket.leave(`post:${postId}`);
      console.log(`[Feed] User ${socket.userId} left post room: ${postId}`);
    });

    // Handle real-time like/dislike
    socket.on('react_to_post', async (data) => {
      try {
        const { postId, value } = data;
        
        // Update reaction in database
        const counts = await communityFeedService.upsertReaction(postId, socket.userId, value);
        
        // Broadcast updated counts to all users viewing this post
        feedNamespace.to(`post:${postId}`).emit('reaction_updated', {
          postId,
          userId: socket.userId,
          value,
          ...counts
        });

        // Acknowledge to the sender
        socket.emit('reaction_acknowledged', {
          postId,
          success: true,
          ...counts
        });

      } catch (error) {
        console.error('[Feed] Error handling reaction:', error);
        socket.emit('reaction_error', {
          postId: data.postId,
          error: error.message
        });
      }
    });

    // Handle real-time comments
    socket.on('comment_on_post', async (data) => {
      try {
        const { postId, body } = data;
        
        // Create comment in database
        const comment = await communityFeedService.createComment(postId, socket.userId, body);
        
        // Broadcast new comment to all users viewing this post
        feedNamespace.to(`post:${postId}`).emit('comment_added', {
          postId,
          comment
        });

        // Acknowledge to the sender
        socket.emit('comment_acknowledged', {
          postId,
          success: true,
          comment
        });

      } catch (error) {
        console.error('[Feed] Error handling comment:', error);
        socket.emit('comment_error', {
          postId: data.postId,
          error: error.message
        });
      }
    });

    // Handle typing indicators for comments
    socket.on('typing_start', (data) => {
      const { postId } = data;
      socket.to(`post:${postId}`).emit('user_typing', {
        postId,
        userId: socket.userId,
        typing: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { postId } = data;
      socket.to(`post:${postId}`).emit('user_typing', {
        postId,
        userId: socket.userId,
        typing: false
      });
    });

    // Handle post creation events
    socket.on('post_created', async (data) => {
      try {
        const { postId } = data;
        const post = await communityFeedService.getPostById(postId);
        
        if (post) {
          // Broadcast new post to all connected users in the feed
          feedNamespace.emit('new_post', { post });
          console.log(`[Feed] New post broadcasted: ${postId}`);
        }
      } catch (error) {
        console.error('[Feed] Error broadcasting new post:', error);
      }
    });

    // Handle video processing completion
    socket.on('video_processed', async (data) => {
      try {
        const { postId, videoUrl, thumbnailUrl, duration, transcript } = data;
        
        // Update post with processed video information
        const updatedPost = await communityFeedService.updatePostAfterProcessing(
          postId, videoUrl, thumbnailUrl, duration, transcript
        );

        if (updatedPost) {
          // Broadcast processing completion to all users
          feedNamespace.emit('post_processed', {
            postId,
            post: updatedPost
          });
          console.log(`[Feed] Video processing completion broadcasted: ${postId}`);
        }
      } catch (error) {
        console.error('[Feed] Error handling video processing completion:', error);
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`[Feed] User ${socket.userId} disconnected from feed namespace`);
    });
  });

  return feedNamespace;
}

// Helper function to emit events from other parts of the application
export function emitToFeedNamespace(io, event, data) {
  const feedNamespace = io.of('/feed');
  feedNamespace.emit(event, data);
}

// Helper function to emit events to specific post rooms
export function emitToPostRoom(io, postId, event, data) {
  const feedNamespace = io.of('/feed');
  feedNamespace.to(`post:${postId}`).emit(event, data);
}