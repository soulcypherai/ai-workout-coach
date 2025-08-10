import { useEffect, useState } from "react";

import { SHOW_CRYPTO_RELATED_FUNCTIONALITY } from "@/constants/misc";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/layouts/pageHeader";
import { logError, logInfo } from "@/lib/errorLogger";
import { RootState, dispatch, useSelector } from "@/store";
import { setAuthModal } from "@/store/slices/modal";

import { Button } from "@/components/ui/button";

import { User } from "@/types/slices";

import AddressWithCopy from "./components/addressWithCopy";
import BioHead from "./components/bioHead";
import GroupTiles from "./components/groupTiles";
import PointsClaim from "./components/pointsClaim";

const ProfilePage = () => {
  const {
    user: appUser,
    isAuthenticated,
    isLoading,
    logout,
    isMiniApp,
    handleMiniAppAuthFlow,
  } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const { isOpen } = useSelector((state: RootState) => state.modal.authModal);

  const handleLogin = async () => {
    try {
      if (isMiniApp) {
        console.log("[Profile] Mini App detected, triggering wallet sign-in");
        await handleMiniAppAuthFlow(true);
        return;
      }

      console.log("[Profile] Web platform detected, opening auth modal");
      dispatch(setAuthModal([true]));
    } catch (error) {
      console.error("[Profile] Login failed:", error);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      logInfo("User successfully logged out", {}, { section: "auth" });
    } catch (error) {
      logError("Logout failed", error, { section: "auth" });
    } finally {
      setIsLoggingOut(false);
    }
  };

  // Close auth modal when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      dispatch(setAuthModal([false]));
    }
  }, [isAuthenticated, isOpen]);

  if (isLoading) {
    return <div>Loading profile...</div>;
  }

  if (!isAuthenticated || !appUser) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-4">
        <PageHeader pageName="Profile" hideBackButton />
        <div className="flex flex-grow flex-col items-center justify-center">
          <BioHead
            name="Anonymous User"
            username="@guest"
            profileImage={undefined}
          />
          <div className="mt-4 text-center">
            <p className="mb-4 text-gray-400">
              Please log in to view your profile and points.
            </p>
            <Button onClick={handleLogin}>Login</Button>
          </div>
        </div>
      </div>
    );
  }

  const user = appUser as User;

  // Extract user data with fallbacks
  const displayName =
    user.handle ||
    `User ${user.wallet_address?.slice(0, 6)}` ||
    "Anonymous User";
  const username = user.handle
    ? `@${user.handle}`
    : user.wallet_address
      ? `@${user.wallet_address.slice(0, 8)}`
      : "@guest";
  const credits = user.credits || 0;

  return (
    <div className="flex h-full flex-col items-center px-4">
      <PageHeader pageName="Profile" hideBackButton />
      <div className="hide-scrollbar w-full overflow-y-auto">
        <BioHead
          name={displayName}
          username={username}
          profileImage={user.pfp_url}
          credits={credits}
          walletAddress={user.wallet_address || "N/A"}
        />
        <PointsClaim credits={credits} />
        {/* Email Display */}
        <div className="bg-bg-foreground rounded-xl">
          {user.email && (
            <div className="mt-4 flex items-center justify-between border-b px-4 py-3.5">
              <p className="text-secondary text-sm">Email</p>
              <p className="text-sm text-gray-200">{user.email}</p>
            </div>
          )}
          {/* Wallet Address Display */}
          <div className="flex items-center justify-between border-b px-4 py-3.5">
            <p className="text-secondary text-sm">Wallet Address</p>
            {user.wallet_address ? (
              <AddressWithCopy address={user.wallet_address || "N/A"} />
            ) : (
              <p className="text-secondary text-sm">Not Connected</p>
            )}
          </div>
          {/* CDP Wallet Address Display */}
          <div className="flex items-center justify-between px-4 py-3.5">
            <p className="text-secondary text-sm">CDP Wallet Address</p>
            <AddressWithCopy address="0xADc3Ff22E54383C727Ed72c9Fa5BEF578d18d734" />
          </div>
        </div>

        <GroupTiles
          options={[
            ...(SHOW_CRYPTO_RELATED_FUNCTIONALITY
              ? [{ name: "Wallet", path: "/wallet" }]
              : []),
            { name: "My pitches", path: "/my-pitches" },
            // { name: "Leaderboard", path: "/leaderboard" },
          ]}
        />
        {/* <GroupTiles
            className="mt-4"
            options={[
              { name: "Settings", path: "/my-pitches" },
            ]}
          /> */}
        {/* Logout Button */}
        <div className="mt-4">
          <button
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="bg-bg-foreground flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-3.5 text-left text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Logout</span>
            {isLoggingOut && (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500 border-t-transparent"></div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
