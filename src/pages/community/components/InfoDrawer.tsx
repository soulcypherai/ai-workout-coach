import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { formatJudgeName, formatUploadDate } from "@/utility";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";

interface CommunityPost {
  id: string;
  video_url: string;
  thumbnail_url: string;
  duration_sec: number;
  transcript: string;
  handle: string;
  wallet_address: string;
  likes_count: number;
  dislikes_count: number;
  score: number;
  comment_count: number;
  created_at: string;
  avatar_id?: string;
  avatar_name?: string;
  avatar_slug?: string;
  avatar_description?: string;
  avatar_image_url?: string;
}

const InfoDrawer = ({
  post,
  likeCount,
  isInfoDrawerOpen,
  setIsInfoDrawerOpen,
}: {
  post: CommunityPost;
  likeCount: number;
  isInfoDrawerOpen: boolean;
  setIsInfoDrawerOpen: (open: boolean) => void;
}) => {
  
  const navigate = useNavigate();
  const uploadDate = useMemo(() => formatUploadDate(post.created_at), [post]);

  return (
    <Drawer
      open={isInfoDrawerOpen}
      onOpenChange={() => setIsInfoDrawerOpen(false)}
    >
      <DrawerContent className="flex w-full max-w-md flex-col justify-self-center !rounded-t-2xl border-t bg-[#1c1d1b] px-4 sm:px-5.5 pb-1.5 backdrop-blur-lg focus:outline-none">
        <div className="flex items-center gap-4 border-b px-1.5 py-5 pb-6">
          <div className="flex h-15 aspect-square shrink-0 items-center justify-center rounded-full bg-white overflow-hidden">
            <img
              src={post.avatar_image_url}
              className="h-full w-full object-cover"
              alt={post.avatar_name || "AI Judge"}
            />
          </div>
          <div className="flex-1 text-white">
            <p className="font-semibold text-lg flex items-center leading-tight">
              {formatJudgeName(post.avatar_name|| "AI Judge") }
              <button
              onClick={()=>{if (post.avatar_slug) {
                navigate(`/call/${post.avatar_slug}`);
              }}}
                  className="ml-2 bg-accent cursor-pointer rounded-full px-2  text-xs font-medium text-black "
                  title="Start a call with this AI judge"
                >
                  Chat
                </button>
            </p>
            {post.avatar_description && (
              <p className="text-sm text-white/80">
                {post.avatar_description}
              </p>
            )}
            <p className="text-xs text-white/50 mt-0.5">
              Used by <span className="font-medium">{post.handle}</span>
            </p>
          </div>
        </div>
        <div className="flex w-full justify-between py-6 text-white">
          <div className="flex flex-1 flex-col items-center">
            <span className="font-semibold text-lg">{likeCount}</span>
            <span className="text-xs sm:text-sm text-white/60">Likes</span>
          </div>
          <div className="flex flex-1 flex-col items-center">
            <span className="font-semibold text-lg">{post.comment_count}</span>
            <span className="text-xs sm:text-sm text-white/60">Comments</span>
          </div>
          <div className="flex flex-1 flex-col items-center">
            <span className="font-semibold text-lg">{uploadDate[0]} </span>
            <span className="text-xs sm:text-sm text-white/60">{uploadDate[1]}</span>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};

export default InfoDrawer;
