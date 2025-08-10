import { useState } from "react";

import { RootState, dispatch, useSelector } from "@/store";
import { setIsAppStarted } from "@/store/slices/app";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { AnimatePresence, motion } from "framer-motion";

const OnboardScreen = () => {
  const { context } = useMiniKit();
  const isAppStarted = useSelector(
    (state: RootState) => state.app.isAppStarted,
  );
  const [isExiting, setIsExiting] = useState(false);

  const handleGetStarted = () => {
    setIsExiting(true);
    // Wait for exit animation to complete before setting app as started
    setTimeout(() => {
      dispatch(setIsAppStarted(true));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 300); // Match the exit animation duration
  };

  return (
    !isAppStarted &&
    (context?.user ? (
      <AnimatePresence>
        {!isAppStarted && !isExiting && (
          <motion.div
            className="absolute top-0 left-0 z-50 flex h-full w-full flex-col items-center justify-center gap-4 bg-black"            
            animate={{ y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <motion.div
              className="border-accent aspect-square h-24 overflow-hidden rounded-full border-3"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
            >
              <img
                src={context.user.pfpUrl}
                className="h-full w-full object-cover"
              />
            </motion.div>

            <motion.div
              className="flex flex-col items-center justify-center gap-2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5, ease: "easeOut" }}
            >
              <motion.h1
                className="font-secondary text-2xl font-bold text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.4 }}
              >
                Hello,{" "}
                <span className="text-accent font-primary">
                  @{context.user.username}
                </span>
              </motion.h1>

              <motion.p
                className="mb-2 text-center text-sm text-white"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                Let's get you started with your AI journey.
              </motion.p>

              <motion.button
                className="bg-accent hover:bg-accent/90 rounded-md px-4 py-2 font-medium text-black transition-colors"
                onClick={handleGetStarted}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1, duration: 0.4 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Get Started
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    ) : (
      <div className="absolute top-0 left-0 z-50 flex h-full w-full bg-black"></div>
    ))
  );
};

export default OnboardScreen;
