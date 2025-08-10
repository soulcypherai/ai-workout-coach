import dummyProfile from "@/assets/png/egghead.png";

const MyPosition = () => {
  return (
    <div className="border-border bg-bg-foreground flex w-full flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3">
      <p className="font-secondary mb-2">#123</p>
      <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-gray-700 bg-black">
        <img
          src={dummyProfile}
          alt={"dummyProfile"}
          className="h-full w-full object-cover"
        />
      </div>
      <p className="font-secondary">Clinton</p>
      <p className="font-secondary text-lg">123 points</p>
    </div>
  );
};

export default MyPosition;
