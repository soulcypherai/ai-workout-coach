import { ArrowLeft } from "lucide-react";
import { MdCallEnd } from "react-icons/md";
import { useNavigate } from "react-router-dom";

const CallEndScreen = () => {
  const navigate = useNavigate();

  return (
    <div className="bg-primary -mb-20 flex h-screen w-full flex-col items-center justify-center">
      <div className="bg-primary relative flex h-full w-full max-w-md flex-col items-center justify-center overflow-hidden border border-white/20">
        <ArrowLeft
          className="absolute top-0 left-0 m-3 h-6 w-6 cursor-pointer opacity-80"
          onClick={() => {
            navigate(-1);
          }}
        />
        <div className="bg-accent mb-7 flex h-20 w-20 items-center justify-center rounded-full">
          <MdCallEnd size={"40px"} color="black" />
        </div>

        <h1 className="text-accent font-secondary text-2xl">
          Your session has ended
        </h1>
        <p className="text-secondary">Thanks for chatting with AI assistant.</p>
      </div>
    </div>
  );
};

export default CallEndScreen;
