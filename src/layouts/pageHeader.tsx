import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PageHeaderProps {
  pageName: string;
  onBackClick?: () => void;
  hideBackButton?: boolean;
  rightContent?: React.ReactNode;
}

const PageHeader = ({
  pageName,
  onBackClick,
  hideBackButton,
  rightContent = null,
}: PageHeaderProps) => {
  const navigate = useNavigate();

  const onBackClickDefault = () => {
    if (onBackClick) {
      onBackClick();
    } else {
      navigate(-1);
    }
  };
  return (
    <div className="bg-primary flex shrink-0 h-[43px] w-full items-end justify-between px-1 pb-1">
      <div className="flex items-center gap-2">
        {hideBackButton ? null : (
          <button
            className="group rounded-full transition-colors hover:bg-gray-100 "
            onClick={onBackClickDefault}
            aria-label="Go back"
          >
            <ArrowLeft className="h-5 w-5 group-hover:text-black" />
          </button>
        )}
        <h1 className="text-xl font-semibold">{pageName}</h1>
      </div>
      {rightContent}
    </div>
  );
};

export default PageHeader;
