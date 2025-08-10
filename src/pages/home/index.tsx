import { useEffect, useState } from "react";

import placeholderAgentImage from "@/assets/png/egghead.png";
import { useAuth } from "@/contexts/AuthContext";
import { logError } from "@/lib/errorLogger";
import { RootState, dispatch, useSelector } from "@/store";
import { setPersonas } from "@/store/slices/app";
import { setAuthModal, setBuyCreditModal } from "@/store/slices/modal";
import { ShoppingBasket } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import AiAgentCard from "./components/aiAgentCard";
import HomeTabs from "./components/tabs";

const API_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3005";

const Home = () => {
  const [activeTab, setActiveTab] = useState("coaches");
  const personas = useSelector((state) => state.app.personas);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [searchParams] = useSearchParams();

  const { isOpen } = useSelector((state: RootState) => state.modal.authModal);
  const { token } = useAuth();

  useEffect(() => {
    const fetchPersonas = async () => {
      try {
        const response = await fetch(`${API_URL}/api/auth/personas`);
        const data = await response.json();
        dispatch(setPersonas(data.personas || []));
      } catch (error) {
        logError("Failed to fetch personas", error, { section: "home_page" });
      }
    };

    fetchPersonas();
  }, []);

  // Close auth modal when user becomes authenticated
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      dispatch(setAuthModal([false]));
    }
  }, [isAuthenticated, isOpen]);

  // Check for insufficient credits error in URL params
  useEffect(() => {
    const insufficientCredits = searchParams.get("insufficient-credits");
    const creditError = searchParams.get("credit-error");
    const avatarName = searchParams.get("avatar");

    if (insufficientCredits === "true" || creditError === "true") {
      console.log(
        "[Home] Opening buy credits modal due to insufficient credits",
      );

      dispatch(
        setBuyCreditModal([
          true,
          {
            title: "Insufficient Credits",
            description: `You have insufficient balance. At least 5 minutes' worth of credits is required to call ${avatarName || "this avatar"}. Please purchase more to proceed.`,
          },
        ]),
      );

      // Clean up URL params after handling
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [searchParams]);

  const getImageForPersona = (imageUrl: string | undefined) => {
    return imageUrl || placeholderAgentImage;
  };

  // Build agents data dynamically from API personas, filtered by category
  const vcs = personas
    .filter((p) => p.category === "vc" || !p.category)
    .map((persona, index) => ({
      id: index + 1,
      avatarId: persona.id,
      name: persona.name,
      description: persona.description || "",
      perMinuteCost: persona.pricing_per_min || 1,
      isUnlocked: persona.is_published,
      x: persona.x_url,
      image: getImageForPersona(persona.image_url),
    }));

  const creators = personas
    .filter((p) => p.category === "creator")
    .map((persona, index) => ({
      id: index + 1,
      avatarId: persona.id,
      name: persona.name,
      description: persona.description || "",
      perMinuteCost: persona.pricing_per_min || 1,
      isUnlocked: persona.is_published,
      x: persona.x_url,
      image: getImageForPersona(persona.image_url),
    }));

  const coaches = personas
    .filter((p) => p.category === "fitness")
    .map((persona, index) => ({
      id: index + 1,
      avatarId: persona.id,
      name: persona.name,
      description: persona.description || "",
      perMinuteCost: persona.pricing_per_min || 1,
      isUnlocked: persona.is_published,
      x: persona.x_url,
      image: getImageForPersona(persona.image_url),
    }));

  const agentsData = {
    vcs,
    creators,
    coaches,
  };

  const handleAgentClick = async (avatarId: string) => {
    if (!isAuthenticated) {
      dispatch(setAuthModal([true]));
      return;
    }

    const persona = personas.find((p) => p.id === avatarId);
    if (persona && persona.slug) {
      navigate(`/call/${persona.slug}`);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  // Get the current agents based on the active tab
  const currentAgents = agentsData[activeTab as keyof typeof agentsData] || [];

  const openBuyTokenModal = async () => {
    if (!token) {
      // if (isMiniApp) {
      //   await handleMiniAppAuthFlow(true);
      //   return;
      // }

      dispatch(
        setAuthModal([
          true,
          undefined,
          {
            title: "unAuthorised",
            description: "🛈 Sign in required to buy credits.",
          },
        ]),
      );
    } else {
      dispatch(setBuyCreditModal([true]));
    }
  };

  return (
    <div className="flex h-full flex-col px-2 pt-3">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="font-secondary text-left text-xl font-bold">
            AIShark.fun
          </p>
          <p className="text-secondary">
            Anything you can dream of, just pitch it
          </p>
        </div>
        <ShoppingBasket className="mr-1" onClick={openBuyTokenModal} />
      </div>
      <HomeTabs onTabChange={handleTabChange} />

      {/* Display agents based on selected tab */}
      <div className="mb-3 flex-grow overflow-x-hidden overflow-y-auto p-2">
        {currentAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <span className="mb-2 text-4xl">🤖</span>
            <p>
              No AI {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}{" "}
              available yet.
            </p>
            <p className="text-xs">Check back soon!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4">
            {currentAgents.map((agent) => (
              <AiAgentCard
                key={agent.id}
                name={agent.name}
                description={agent.description}
                price={agent.perMinuteCost}
                avatarId={agent.avatarId}
                isUnlocked={agent.isUnlocked}
                x={agent.x}
                image={agent.image}
                onClick={() => handleAgentClick(agent.avatarId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;