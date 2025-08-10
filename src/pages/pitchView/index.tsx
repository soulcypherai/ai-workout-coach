import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/layouts/pageHeader";
import { useParams } from "react-router-dom";

import PitchVideo from "./player";
import { useSelector } from "react-redux";
import { RootState } from "@/store";

interface PitchData {
  id: string;
  video_url: string;
  thumbnail_url: string;
  avatar_image_url?: string;
  avatar_name?: string;
  is_published: boolean;
}

const PitchView = () => {
  const { pitchId } = useParams();
  const { isLoading } = useAuth();
  const [pitchData, SetPitchData] = useState<PitchData | null>(null);
  const pitches = useSelector((state: RootState) => state.pitches);
  

  useEffect(() => {
    if (pitches) {
      const pitch = pitches.find((pitch) => pitch.id === pitchId);
      if (pitch) {
        SetPitchData({
          id: pitch.id,
          video_url: pitch.video_url,
          thumbnail_url: pitch.thumbnail_url,
          avatar_image_url: pitch.avatar_image_url,
          avatar_name: pitch.avatar_name,
          is_published: pitch.is_published,
        });
      }
    }
  }, [pitchId]);

  return (
    <div className="flex h-full w-full flex-col">
      <PageHeader pageName="Your Pitch" />
      {!isLoading && !pitchData ? (
        <div className="flex h-full justify-center items-center">No Pitch Found</div>
      ) : (
        <div className="relative mx-auto mt-2 flex h-full w-full max-w-md flex-col overflow-auto bg-black">
          <PitchVideo pitch={pitchData} sessionRecordingId={pitchId} />
        </div>
      )}
    </div>
  );
};

export default PitchView;
