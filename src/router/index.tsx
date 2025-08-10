import { AvatarChatProvider } from "@/contexts/AvatarChatContext";
import MainLayout from "@/layouts/MainLayout";
import NotFound from "@/pages/NotFound";
import AdminPersonas from "@/pages/admin";
import AuthCallback from "@/pages/auth/callback";
import ResetPassword from "@/pages/auth/reset-password";
import CallPage from "@/pages/call";
import CommunityPage from "@/pages/community";
import EpisodeStreamPage from "@/pages/episodeStream";
import Home from "@/pages/home";
import PitchView from "@/pages/pitchView/index.tsx";
// import LeaderboardPage from "@/pages/leaderboard";
import MyPitches from "@/pages/pitches";
import ProfilePage from "@/pages/profile";
import PurchaseCancelled from "@/pages/purchase/cancelled";
import PurchaseSuccess from "@/pages/purchase/success";
import ShowsPage from "@/pages/shows";
import PurchaseTest from "@/pages/test/purchase";
import CDPTest from "@/pages/CDPTest";
import WalletPage from "@/pages/wallet";
import { createBrowserRouter } from "react-router-dom";

import ProtectedRoute from "@/components/ProtectedRoute";

const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <AvatarChatProvider>
        <MainLayout />
      </AvatarChatProvider>
    ),
    children: [
      {
        index: true,
        element: <Home />,
      },
      {
        element: <ProtectedRoute />,
        children: [{ path: "call/:slug", element: <CallPage /> }],
      },
      { path: "profile", element: <ProfilePage /> },
      { path: "my-pitches", element: <MyPitches /> },
      { path: "my-pitches/:pitchId", element: <PitchView /> },
      { path: "wallet", element: <WalletPage /> },
      { path: "community", element: <CommunityPage /> },
      { path: "community/:postId", element: <CommunityPage /> },
      // { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "shows", element: <ShowsPage /> },
      { path: "episode-stream", element: <EpisodeStreamPage /> },
      { path: "admin", element: <AdminPersonas /> },
      { path: "test/purchase", element: <PurchaseTest /> },
      { path: "test/cdp", element: <CDPTest /> },
      // {
      //   element: <ProtectedRoute />,
      //   children: [
      //     {
      //       path: "dashboard",
      //       element: <Dashboard />,
      //     },
      //   ],
      // },
    ],
  },
  {
    path: "/purchase/success",
    element: <PurchaseSuccess />,
  },
  {
    path: "/purchase/cancelled",
    element: <PurchaseCancelled />,
  },
  {
    path: "/auth/callback",
    element: <AuthCallback />,
  },
  {
    path: "/auth/reset-password",
    element: <ResetPassword />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

export default router;