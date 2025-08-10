"use strict";

const { ethers } = require("hardhat");
const { preDeployConsole, postDeployConsole } = require("../utils/contracts");
const { verifyContract } = require("../utils/verify");
const { CONSTRUCTOR_ARGS } = require("./args");

async function main() {
  const { chainId } = await ethers.provider.getNetwork();
  const [owner] = await ethers.getSigners();

  const CONTRACT_NAME = "PaymentProcessor";

  await preDeployConsole({
    signerAddress: owner.address,
    contractName: CONTRACT_NAME,
  });

  const PaymentProcessorFactory = await ethers.getContractFactory(
    CONTRACT_NAME
  );

  const [validator, vault, token] = CONSTRUCTOR_ARGS[chainId];

  let paymentProcessor = await PaymentProcessorFactory.connect(owner).deploy(
    validator,
    vault,
    token
  );

  paymentProcessor = await postDeployConsole({
    contractName: CONTRACT_NAME,
    contract: paymentProcessor,
  });

  try {
    const contractPath = `contracts/${CONTRACT_NAME}.sol:${CONTRACT_NAME}`;
    await verifyContract({
      contractPath: contractPath,
      contractAddress: paymentProcessor.address,
      args: [validator, vault, token],
    });
  } catch (error) {
    console.log(error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log(error);
    process.exit(1);
  });
