import { useEffect } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { RootState, useSelector } from "@/store";
import { useAddFrame } from "@coinbase/onchainkit/minikit";
import { Outlet } from "react-router-dom";

import BottomNavbar from "./bottomNavbar";

const MainLayout = () => {
  const isAppStarted = useSelector(
    (state: RootState) => state.app.isAppStarted,
  );
  const { isMiniApp, isHydrating, isLoading } = useAuth();
  const addFrame = useAddFrame();

  const handleAddFrame = async () => {
    const result = await addFrame();
    if (result) {
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isMiniApp && isAppStarted && !isLoading) {
        console.log("prompt to add frame");
        handleAddFrame();
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [isMiniApp, isAppStarted, isHydrating, isLoading]);
  return (
    <div className="text-primary mx-auto flex h-[100dvh] w-full max-w-screen-xl flex-col">
      <main className="flex flex-grow flex-col overflow-y-auto">
        <Outlet />
      </main>
      <BottomNavbar />
    </div>
  );
};

export default MainLayout;
