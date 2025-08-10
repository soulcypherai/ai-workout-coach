import PageHeader from "@/layouts/pageHeader";

import ShowsTabs from "./components/showsTabs";

const Shows = () => {
  return (
    <div className="px-4 h-full overflow-hidden">
      <PageHeader pageName="Live Shows" />
      <ShowsTabs />
    </div>
  );
};

export default Shows;
