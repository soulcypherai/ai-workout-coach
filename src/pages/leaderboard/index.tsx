import dummyProfile from "@/assets/png/egghead.png";
import PageHeader from "@/layouts/pageHeader";

import MyPosition from "./components/myPosition";
import PositionTile from "./components/positionTile";

const LeaderboardPage = () => {
  // Sample leaderboard data
  const leaderboardData = [
    {
      id: 1,
      position: 1,
      name: "Clinton",
      imageUrl: dummyProfile,
      points: 9999,
    },
    { id: 2, position: 2, name: "Alex", imageUrl: dummyProfile, points: 8765 },
    {
      id: 3,
      position: 3,
      name: "Jordan",
      imageUrl: dummyProfile,
      points: 7654,
    },
    {
      id: 4,
      position: 4,
      name: "Taylor",
      imageUrl: dummyProfile,
      points: 6543,
    },
    { id: 5, position: 5, name: "Casey", imageUrl: dummyProfile, points: 5432 },
    {
      id: 6,
      position: 6,
      name: "Morgan",
      imageUrl: dummyProfile,
      points: 5321,
    },
    { id: 7, position: 7, name: "Jamie", imageUrl: dummyProfile, points: 5210 },
    { id: 8, position: 8, name: "Riley", imageUrl: dummyProfile, points: 5100 },
    { id: 9, position: 9, name: "Drew", imageUrl: dummyProfile, points: 4999 },
    {
      id: 10,
      position: 10,
      name: "Avery",
      imageUrl: dummyProfile,
      points: 4888,
    },
    {
      id: 11,
      position: 11,
      name: "Peyton",
      imageUrl: dummyProfile,
      points: 4777,
    },
    {
      id: 12,
      position: 12,
      name: "Skyler",
      imageUrl: dummyProfile,
      points: 4666,
    },
    {
      id: 13,
      position: 13,
      name: "Harper",
      imageUrl: dummyProfile,
      points: 4555,
    },
    {
      id: 14,
      position: 14,
      name: "Quinn",
      imageUrl: dummyProfile,
      points: 4444,
    },
    {
      id: 15,
      position: 15,
      name: "Reese",
      imageUrl: dummyProfile,
      points: 4333,
    },
    {
      id: 16,
      position: 16,
      name: "Emerson",
      imageUrl: dummyProfile,
      points: 4222,
    },
    {
      id: 17,
      position: 17,
      name: "Finley",
      imageUrl: dummyProfile,
      points: 4111,
    },
    {
      id: 18,
      position: 18,
      name: "Dakota",
      imageUrl: dummyProfile,
      points: 4000,
    },
    {
      id: 19,
      position: 19,
      name: "Rowan",
      imageUrl: dummyProfile,
      points: 3900,
    },
    {
      id: 20,
      position: 20,
      name: "Sawyer",
      imageUrl: dummyProfile,
      points: 3800,
    },
  ];

  return (
    <div className="flex h-full flex-col px-4 ">
      <PageHeader pageName="Leaderboard" />
      <p className="mt-4 mb-2 text-sm">Your rank</p>
      <MyPosition />
      <p className="my-3 text-sm">Leader Board</p>

      <div className="flex flex-col gap-2 overflow-y-auto ">
        {leaderboardData.map((user) => (
          <PositionTile
            key={user.id}
            position={user.position}
            name={user.name}
            imageUrl={user.imageUrl}
            points={user.points}
          />
        ))}
      </div>
    </div>
  );
};

export default LeaderboardPage;
