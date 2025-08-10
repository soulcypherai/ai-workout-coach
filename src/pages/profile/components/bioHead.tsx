import dummyProfile from "@/assets/png/egghead.png";

interface BioHeadProps {
  name?: string;
  username?: string;
  profileImage?: string;
  credits?: number;
  walletAddress?: string;
}

const BioHead = ({
  name = "Anonymous User",
  username = "@guest",
  profileImage,
}: BioHeadProps) => {
  return (
    <div className="mt-6 mb-3 flex w-full flex-col items-center justify-center bg-transparent">
      <div className="relative">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2 border-gray-700 bg-black">
          <img
            src={profileImage || dummyProfile}
            alt={name}
            className="h-full w-full object-cover"
          />
        </div>
      </div>
      <h2 className="mt-4 text-xl font-medium text-white">{name}</h2>
      <p className="mt-1 text-sm text-gray-400">{username}</p>
    </div>
  );
};

export default BioHead;
