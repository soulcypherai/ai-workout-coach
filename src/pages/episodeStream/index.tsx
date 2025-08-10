import { useEffect, useState } from "react";

import PageHeader from "@/layouts/pageHeader";
import { useSelector } from "@/store";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

import VerdictsList from "./components/verdictsList";

const EpisodeStream = () => {
  const streamingShow = useSelector((state) => state.shows.streamingShow);
  const [videoId, setVideoId] = useState<string | null>(null);

  // Extract YouTube video ID from URL
  useEffect(() => {
    if (streamingShow?.url) {
      // Extract video ID from YouTube URL
      const extractVideoId = (url: string) => {
        const regExp =
          /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
        const match = url.match(regExp);
        return match && match[2].length === 11 ? match[2] : null;
      };

      setVideoId(extractVideoId(streamingShow.url));
    }
  }, [streamingShow]);

  return (
    <div className="flex flex-col">
      <PageHeader pageName={streamingShow?.title ?? "Streaming"} />

      <div className="container mx-auto px-4 py-6">
        {streamingShow ? (
          <div className="flex flex-col gap-6">
            {/* Video Embed Section */}
            <div className="w-full overflow-hidden rounded-lg">
              {videoId ? (
                <div className="aspect-video">
                  <iframe
                    src={`https://www.youtube.com/embed/${videoId}`}
                    title={streamingShow.title}
                    className="h-full w-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-gray-800">
                  <p className="text-gray-400">Video not available</p>
                </div>
              )}
            </div>

            {/* Episode Details Section with Accordion */}
            <div className="border-border rounded-lg border">
              <Accordion
                type="single"
                collapsible
                defaultValue="episode-details"
                className="w-full"
              >
                <AccordionItem value="episode-details" className="border-0">
                  <AccordionTrigger className="px-6 py-4">
                    <h1 className="text-accent text-xl font-bold">
                      {streamingShow.title}
                    </h1>
                  </AccordionTrigger>
                  <AccordionContent className="px-6">
                    <div className="flex flex-col gap-2">
                      <p className="text-sm text-gray-400">
                        {streamingShow.date}
                      </p>
                      <p className="">{streamingShow.description}</p>
                      {/* <div className="flex items-center">
                        <span className="rounded-full px-3 py-1 text-sm text-white">
                          Reward: {streamingShow.reward} tokens
                        </span>
                      </div> */}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            {/* <div className="bg-secondary/50 h-px w-full" /> */}
            <p className="font-secondary text-xl">Predict AI Judges Verdict </p>
            <VerdictsList episodeId={streamingShow.id} />
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center">
            <p className="text-gray-400">
              No episode selected. Please choose an episode from the shows page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EpisodeStream;
