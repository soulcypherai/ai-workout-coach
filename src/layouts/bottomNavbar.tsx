import profilePhoto from "@/assets/png/egghead.png";
import chatActiveIcon from "@/assets/svg/chat-active.svg";
import chatIcon from "@/assets/svg/chat.svg";
// import medalActiveIcon from "@/assets/svg/medal-active.svg";
// import medalIcon from "@/assets/svg/medal.svg";
import monitorActiveIcon from "@/assets/svg/monitor-active.svg";
import monitorIcon from "@/assets/svg/monitor.svg";
import peopleActiveIcon from "@/assets/svg/people-active.svg";
import peopleIcon from "@/assets/svg/people.svg";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";

const BottomNavbar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {user}=useAuth()

  // Don't render the navbar if the current path is "/call"
  if (location.pathname.startsWith("/call")) {
    return null;
  }

  const movetoProfilePage = () => {
    navigate("/profile");
  };

  return (
    <div className="bg-bg-primary border-t border-gray-700 p-3 shadow-lg">
      <div className="mx-auto flex max-w-screen-xl items-center justify-between px-4">
        <NavItem
          icon={chatIcon}
          activeIcon={chatActiveIcon}
          to="/"
          alt="Home"
          isActive={location.pathname === "/"}
        />
        <NavItem
          icon={peopleIcon}
          activeIcon={peopleActiveIcon}
          to="/community"
          alt="Community"
          isActive={location.pathname === "/community"}
        />
        <NavItem
          icon={monitorIcon}
          activeIcon={monitorActiveIcon}
          to="/shows"
          alt="Shows"
          isActive={location.pathname === "/shows"}
        />
        {/* <NavItem
          icon={medalIcon}
          activeIcon={medalActiveIcon}
          to="/leaderboard"
          alt="Leaderboard"
          isActive={location.pathname === "/leaderboard"}
        /> */}
        <div className="flex items-center" onClick={movetoProfilePage}>
          <div className="border-primary h-8 w-8 overflow-hidden rounded-full border-2">
            <img
              src={user?.pfp_url || profilePhoto}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface NavItemProps {
  icon: string;
  activeIcon: string;
  to: string;
  alt: string;
  isActive: boolean;
}

const NavItem = ({ icon, activeIcon, to, alt, isActive }: NavItemProps) => {
  return (
    <Link to={to} className="flex items-center">
      <div className="h-6 w-6">
        <img
          src={isActive ? activeIcon : icon}
          alt={alt}
          className="h-full w-full"
        />
      </div>
    </Link>
  );
};

export default BottomNavbar;
