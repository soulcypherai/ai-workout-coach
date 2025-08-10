"use strict";

const { ethers } = require("hardhat");
const { preDeployConsole, postDeployConsole } = require("../utils/contracts");
const { verifyContract } = require("../utils/verify");

async function main() {
  const [owner] = await ethers.getSigners();

  const CONTRACT_NAME = "Token";
  const CONSTRUCTOR_ARGS = ethers.utils.parseUnits("1000000", 18);

  await preDeployConsole({
    signerAddress: owner.address,
    contractName: CONTRACT_NAME,
  });

  const TokenFactory = await ethers.getContractFactory(CONTRACT_NAME);

  let tokenManager = await TokenFactory.connect(owner).deploy(CONSTRUCTOR_ARGS);

  tokenManager = await postDeployConsole({
    contractName: CONTRACT_NAME,
    contract: tokenManager,
  });

  try {
    const contractPath = `contracts/${CONTRACT_NAME}.sol:${CONTRACT_NAME}`;
    await verifyContract({
      contractPath: contractPath,
      contractAddress: tokenManager.address,
      args: [CONSTRUCTOR_ARGS],
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
