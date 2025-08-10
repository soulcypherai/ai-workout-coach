const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("PaymentProcessor", function () {
  async function deployPaymentProcessorFixture() {
    const [owner, validator, vault, user] = await ethers.getSigners();

    const TokenFactory = await ethers.getContractFactory("Token");
    const token = await TokenFactory.deploy(1_000_000_000n);

    const PaymentProcessorFactory = await ethers.getContractFactory(
      "PaymentProcessor"
    );
    const processor = await PaymentProcessorFactory.deploy(
      validator.address,
      vault.address,
      token.address
    );

    return { processor, token, owner, validator, vault, user };
  }

  describe("Deployment", function () {
    it("Should set validator, vault, and token correctly", async function () {
      const { processor, validator, vault, token } = await loadFixture(
        deployPaymentProcessorFixture
      );

      expect(await processor.validator()).to.equal(validator.address);
      expect(await processor.vault()).to.equal(vault.address);
      expect(await processor.token()).to.equal(token.address);
    });

    it("Should revert on zero address deployment", async function () {
      const Factory = await ethers.getContractFactory("PaymentProcessor");

      await expect(
        Factory.deploy(
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero
        )
      ).to.be.revertedWithCustomError(Factory, "ZeroAddress");
    });
  });

  describe("Config Updates", function () {
    it("Should allow owner to update config", async function () {
      const { processor, owner, user, token } = await loadFixture(
        deployPaymentProcessorFixture
      );

      const newValidator = user.address;
      const newVault = ethers.Wallet.createRandom().address;
      const newToken = token.address;

      await expect(
        processor.connect(owner).updateConfig(newValidator, newVault, newToken)
      )
        .to.emit(processor, "ConfigUpdated")
        .withArgs(newValidator, newVault, newToken);

      expect(await processor.validator()).to.equal(newValidator);
      expect(await processor.vault()).to.equal(newVault);
      expect(await processor.token()).to.equal(newToken);
    });

    it("Should revert if non-owner calls updateConfig", async function () {
      const { processor, user, token } = await loadFixture(
        deployPaymentProcessorFixture
      );

      const newValidator = ethers.Wallet.createRandom().address;
      const newVault = ethers.Wallet.createRandom().address;

      await expect(
        processor
          .connect(user)
          .updateConfig(newValidator, newVault, token.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Payments", function () {
    it("Should process payment with valid signature", async function () {
      const { processor, validator, user, token, vault } = await loadFixture(
        deployPaymentProcessorFixture
      );

      const uuid = ethers.utils.formatBytes32String("user-uuid-1");
      const creditAmount = 1000n;
      const tokenAmount = 2000n;
      const expiry = (Math.floor(Date.now() / 1000) + 600).toString();
      const nonce = await processor.userNonce(uuid);

      const { chainId } = await ethers.provider.getNetwork();

      await token.transfer(user.address, tokenAmount);
      await token.connect(user).approve(processor.address, tokenAmount);

      let payload = ethers.utils.defaultAbiCoder.encode(
        [
          "bytes32",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "uint256",
        ],
        [
          uuid,
          creditAmount,
          tokenAmount,
          nonce,
          expiry,
          processor.address,
          chainId,
        ]
      );
      let hash = ethers.utils.keccak256(payload);
      const signature = await validator.signMessage(
        ethers.utils.arrayify(hash)
      );

      await expect(
        processor.connect(user).pay(
          {
            user: uuid,
            creditAmount,
            tokenAmount,
            expiry,
          },
          signature
        )
      )
        .to.emit(processor, "PaymentProcessed")
        .withArgs(uuid, creditAmount, tokenAmount);

      // Funds should be transferred to vault
      expect(await token.balanceOf(vault.address)).to.equal(tokenAmount);
    });

    it("Should revert on expired receipt", async function () {
      const { processor, validator, user, token } = await loadFixture(
        deployPaymentProcessorFixture
      );

      const uuid = ethers.utils.formatBytes32String("user-expired");
      const creditAmount = 1000n;
      const tokenAmount = 2000n;
      const expiry = (Math.floor(Date.now() / 1000) - 100).toString(); // already expired
      const nonce = await processor.userNonce(uuid);

      const hash = ethers.utils.solidityKeccak256(
        [
          "bytes32",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "uint256",
        ],
        [
          uuid,
          creditAmount,
          tokenAmount,
          nonce,
          expiry,
          processor.address,
          (await ethers.provider.getNetwork()).chainId,
        ]
      );
      const signature = await validator.signMessage(
        ethers.utils.arrayify(hash)
      );

      await expect(
        processor
          .connect(user)
          .pay({ user: uuid, creditAmount, tokenAmount, expiry }, signature)
      ).to.be.revertedWithCustomError(processor, "ReceiptExpired");
    });

    it("Should revert on invalid signature", async function () {
      const { processor, validator, user, token } = await loadFixture(
        deployPaymentProcessorFixture
      );

      const uuid = ethers.utils.formatBytes32String("user-invalid");
      const creditAmount = 1000n;
      const tokenAmount = 2000n;
      const expiry = (Math.floor(Date.now() / 1000) + 300).toString();
      const nonce = await processor.userNonce(uuid);

      const hash = ethers.utils.solidityKeccak256(
        [
          "bytes32",
          "uint256",
          "uint256",
          "uint256",
          "uint256",
          "address",
          "uint256",
        ],
        [
          uuid,
          creditAmount,
          tokenAmount,
          nonce + 1,
          expiry,
          processor.address,
          (await ethers.provider.getNetwork()).chainId,
        ] // Wrong nonce
      );
      const invalidSignature = await validator.signMessage(
        ethers.utils.arrayify(hash)
      );

      await expect(
        processor
          .connect(user)
          .pay(
            { user: uuid, creditAmount, tokenAmount, expiry },
            invalidSignature
          )
      ).to.be.revertedWithCustomError(processor, "InvalidSignature");
    });
  });

  describe("ETH Transfer Rejection", function () {
    it("Should reject ETH via receive", async () => {
      const { processor, user } = await loadFixture(
        deployPaymentProcessorFixture
      );

      await expect(
        user.sendTransaction({
          to: processor.address,
          value: ethers.utils.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(processor, "EtherTransfersNotAllowed");
    });

    it("Should reject ETH via fallback", async () => {
      const { processor, user } = await loadFixture(
        deployPaymentProcessorFixture
      );

      await expect(
        user.sendTransaction({
          to: processor.address,
          data: "0xdeadbeef",
          value: ethers.utils.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(processor, "EtherTransfersNotAllowed");
    });
  });
});
