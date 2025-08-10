import { allVerdicts } from "@/constants/verdicts";

import VerdictBox from "./verdictBox";

const VerdictsList = ({ episodeId }: { episodeId: number }) => {
  const episodeVerdicts = allVerdicts[episodeId];
  return (
    <div className="flex flex-col gap-5">
      {episodeVerdicts.map((verdict, index) => (
        <VerdictBox {...verdict} key={index} index={index + 1} />
      ))}
    </div>
  );
};

export default VerdictsList;
