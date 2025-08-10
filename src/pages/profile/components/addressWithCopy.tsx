import { shortenAddress } from "@/lib/utils";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const AddressWithCopy = ({ address }: { address: string }) => {
  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    toast.success("Address copied to clipboard!");
  };

  return (
    <div className="text-primary flex cursor-pointer items-center gap-2 text-sm" onClick={handleCopy}>
      {shortenAddress(address)}
      <span>
        <Copy className="text-accent" size={16} />
      </span>{" "}
    </div>
  );
};

export default AddressWithCopy;
