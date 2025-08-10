import ep1Bg from "@/assets/png/ep1-bg.png";
import ep2Bg from "@/assets/png/ep2-bg.png";
import ep3Bg from "@/assets/png/ep3-bg.png";
import { dispatch } from "@/store";
import { setStreamingShow } from "@/store/slices/shows";
import { useNavigate } from "react-router-dom";

import { Show } from "@/types/slices";

import ShowCard from "./showCard";

// Episode data array for past shows

const episodesData: Show[] = [
  {
    id: 3,
    title: "AI Shark Tank: EP3",
    description:
      "In this episode of AI Shark Tank, Will takes the stage to pitch Trade Clash, while KZ shares their vision for CHOMP, and AIVeronica unveils the concept behind AI Game Master.",
    date: "June 18 2025",
    reward: 280,
    image: ep3Bg, // Using the same image for now, you can replace with appropriate images
    liveStatus: "past",
    url: "https://youtu.be/7wPij1M7Iyw",
  },
  {
    id: 2,
    title: "AI Shark Tank: EP2",
    description:
      "In this episode of AI Shark Tank, John Chen takes the stage to pitch Gloria AI, while Julie shares their vision for Tako Protocol, and John Arrow unveils the concept behind FreedomGPT.",
    date: "May 28, 2025",
    reward: 250,
    image: ep2Bg, // Using the same image for now, you can replace with appropriate images
    liveStatus: "past",
    url: "https://youtu.be/2gtv1l9RkMg",
  },
  {
    id: 1,
    title: "AI Shark Tank: EP1",
    description:
      "In this episode of AI Shark Tank, 0xGrim takes the stage to pitch Survivor.Fun, while Jenna Greenfield shares their vision for Wanderers.ai, and Lani unveils the concept behind Infinityg.ai.",
    date: "May 15 2025",
    reward: 220,
    image: ep1Bg,
    liveStatus: "past",
    url: "https://youtu.be/9ol4cvGSq8s",
  },
];

const PastShows = () => {
  const navigate = useNavigate();

  const handleOnEpisodeClick = (episode: Show) => {
    dispatch(setStreamingShow(episode));
    navigate("/episode-stream");
  };
  return (
    <div className="mt-5 mb-20 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {episodesData.map((episode) => (
        <ShowCard
          key={episode.id}
          title={episode.title}
          description={episode.description}
          date={episode.date}
          reward={episode.reward}
          image={episode.image}
          liveStatus={episode.liveStatus}
          onClick={() => handleOnEpisodeClick(episode)}
        />
      ))}
    </div>
  );
};

export default PastShows;
