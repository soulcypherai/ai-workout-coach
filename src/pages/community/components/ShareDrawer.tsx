import { useState } from "react";

import favIcon from "@/assets/png/fav.png";
import InstagramSvg from "@/assets/svg/instagram.svg";
import TikTokSvg from "@/assets/svg/tiktok.svg";
import TwitterSvg from "@/assets/svg/twitter.svg";
import { logError } from "@/lib/errorLogger";
import { MdContentCopy } from "react-icons/md";
import { SlOptions } from "react-icons/sl";

import { Drawer, DrawerContent } from "@/components/ui/drawer";

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
  avatar_description?: string;
  avatar_image_url?: string;
}

const ShareDrawer = ({
  post,
  isShareDrawerOpen,
  setIsShareDrawerOpen,
}: {
  post: CommunityPost;
  isShareDrawerOpen: boolean;
  setIsShareDrawerOpen: (open: boolean) => void;
}) => {
  const url = window.location.href;
  const domain = new URL(url).hostname;
  const [showCopiedNotification, setShowCopiedNotification] = useState(false);
  

  const handleTwitterShare = () => {
    const postUrl = `${window.location.origin}/community/${post.id}`;
    const text = `Check out ${post.handle}'s conversation with ${post.avatar_name || "AI Judge"}`;
    const tweetUrl = new URL("https://twitter.com/intent/tweet");

    tweetUrl.searchParams.set("text", text);
    tweetUrl.searchParams.set("url", postUrl);

    window.open(tweetUrl.toString(), "_blank", "noopener,noreferrer");
  };

  const handlePlatformShare = async (platform: "tiktok" | "instagram") => {
    try {
      const response = await fetch(post.video_url, { mode: "cors" });
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${platform}-video.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      if (platform === "tiktok") {
        window.open("https://www.tiktok.com/upload", "_blank");
      } else if (platform === "instagram") {
        window.open("https://www.instagram.com", "_blank");
      }

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
      }, 20000);
    } catch (err) {
      console.error(`Download failed for ${platform}:`, err);
    }
  };

  const handleShareMore = async () => {
    const postUrl = `${window.location.origin}/community/${post.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          text: `Check out ${post.handle}'s conversation with ${post.avatar_name || "AI Judge"}`,
          url: postUrl,
        });
      } catch (error) {
        logError("Error sharing post", error, {
          section: "community",
          postId: post.id,
        });
      }
    } else {
      // Fallback: copy to clipboard
      await navigator.clipboard.writeText(postUrl);
      setShowCopiedNotification(true);
      setTimeout(() => setShowCopiedNotification(false), 2000);
      // Successfully copied to clipboard - no need to log as error
    }
  };

  const handleCopy = async () => {
    const postUrl = `${window.location.origin}/community/${post.id}`;

    // await navigator.clipboard.writeText(
    //   `Check out ${post.handle}'s conversation with ${post.avatar_name || "AI Judge"}\n ${postUrl}`,
    // );
    await navigator.clipboard.writeText(postUrl);
    setShowCopiedNotification(true);
    setTimeout(() => setShowCopiedNotification(false), 2000);
  };

  return (
    <Drawer
      open={isShareDrawerOpen}
      onOpenChange={() => setIsShareDrawerOpen(false)}
    >
      <DrawerContent className="flex w-full max-w-md flex-col justify-self-center !rounded-t-2xl border-t bg-[#1c1d1b] px-5.5 pb-1.5 backdrop-blur-lg focus:outline-none">
        <div className="flex gap-4 border-b py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-white">
            <img src={favIcon} className="h-[80%]" alt="" />
          </div>
          <div className="flex-1 text-white">
            <p className="line-clamp-1">
              Check out ${post.handle}'s conversation with $
              {post.avatar_name || "AI Judge"}
            </p>
            <p>{domain}</p>
          </div>
          <div
            onClick={handleCopy}
            className="flex h-12 w-8 shrink-0 cursor-pointer items-center justify-center"
          >
            <MdContentCopy size={"22px"} className="text-white/80" />
          </div>
        </div>
        <div className="flex w-full justify-between py-5 text-white">
          <button
            onClick={() => handlePlatformShare("instagram")}
            className="flex cursor-pointer flex-col items-center gap-1"
          >
            <img src={InstagramSvg} alt="Instagram" className="h-10 w-10" />
            <span className="text-xs">Instagram</span>
          </button>

          <button
            onClick={() => handlePlatformShare("tiktok")}
            className="flex cursor-pointer flex-col items-center gap-1"
          >
            <img
              src={TikTokSvg}
              alt="TikTok"
              className="h-10 w-10 rounded-sm"
            />
            <span className="text-xs">TikTok</span>
          </button>

          <button
            onClick={handleTwitterShare}
            className="flex cursor-pointer flex-col items-center gap-1"
          >
            <img src={TwitterSvg} alt="Twitter" className="h-10 w-10" />

            <span className="text-xs">X</span>
          </button>

          <button
            onClick={handleShareMore}
            className="flex cursor-pointer flex-col items-center gap-1"
          >
            <div className="flex h-10 w-10 items-center justify-center">
              <SlOptions size={"26px"} className="text-white/80" />
            </div>
            <span className="text-xs">More</span>
          </button>
        </div>
      </DrawerContent>
      {showCopiedNotification && (
        <div className="absolute top-8 left-1/2 z-70 -translate-x-1/2 transform rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-lg transition-all duration-300 ease-in-out">
          Link copied!
        </div>
      )}
    </Drawer>
  );
};

export default ShareDrawer;
