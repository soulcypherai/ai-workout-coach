import PageHeader from "@/layouts/pageHeader";
import { ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

import AddressWithCopy from "../profile/components/addressWithCopy";
import InvisibleBox from "./components/invisibleBox";

const MyWalletPage = () => {
  return (
    <div className="px-4 py-5">
      <PageHeader
        pageName="Wallet"
        rightContent={
          <Button variant="secondary" className="text-primary mt-3">
            <AddressWithCopy address="0x35D93bfCBC021Ba09acD613E6B7A36D616C7FE67" />
          </Button>
        }
      />
      <InvisibleBox heading="Pitch points" value="450 P" className="my-3" />
      <div className="flex items-center justify-between gap-3">
        <InvisibleBox heading="Streak" value="3 Days" />
        <InvisibleBox heading="Multiplier" value="x1.5" />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <Button className="flex-1">Convert to $SHARK</Button>
        <Button variant="secondary" className="flex-1">
          Claim daily bonus
        </Button>
      </div>
      <div className="mt-3">
        <InvisibleBox
          heading="Total $SHARK"
          value="400"
          subHeading={
            <p className="text-accent">
              ~ <span>$243</span>
            </p>
          }
        />
        <Button variant="secondary" className="text-primary mt-3 w-full">
          <ArrowUp /> Withdraw
        </Button>
      </div>
    </div>
  );
};

export default MyWalletPage;
