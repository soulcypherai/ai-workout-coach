// SPDX-License-Identifier: MIT
pragma solidity 0.8.19;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {
    IERC20,
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title PaymentProcessor
 * @notice Manages the purchase of credits using a signature-based verification system.
 * Users can buy credits by providing a valid signature from a designated validator.
 * The owner has the ability to update the validator and vault addresses.
 */
contract PaymentProcessor is Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    address public validator; // Address of the validator that signs credit purchase approvals
    address public vault; // Address where payment tokens are sent
    address public token; // Address of the token

    mapping(bytes32 => uint256) public userNonce; // Tracks the nonce for each user to prevent replay attacks

    struct Receipt {
        bytes32 user; // keccak256 hash of UUID
        uint256 creditAmount; // Credits being purchased
        uint256 tokenAmount; // Tokens to be paid
        uint256 expiry; // Timestamp until the receipt is valid
    }

    /**
     * @notice Emitted when the validator or vault address is updated.
     * @param newValidator The updated validator address.
     * @param newVault The updated vault address.
     * @param newToken The updated payment token address.
     */
    event ConfigUpdated(
        address indexed newValidator,
        address indexed newVault,
        address indexed newToken
    );

    /**
     * @notice Emitted when a user successfully purchases credits.
     * @param user The off-chain user identifier (e.g., UUID)
     * @param creditAmount The amount of credits purchased.
     * @param tokenAmount The amount of tokens paid.
     */
    event PaymentProcessed(
        bytes32 indexed user,
        uint256 creditAmount,
        uint256 tokenAmount
    );

    // Custom errors for specific failure conditions
    error ZeroAddress(); // Thrown when an invalid (zero) address is provided
    error ZeroAmount(); // Thrown when an invalid (zero) amount is provided
    error ReceiptExpired(); // Thrown when the provided signature is expired
    error InvalidSignature(); // Thrown when the provided signature is invalid
    error EtherTransfersNotAllowed(); // Thrown when an attempt is made to send ETH directly

    /**
     * @notice Initializes the contract with the validator and vault addresses.
     * @param _validator The address of the validator signing transactions.
     * @param _vault The address of the vault receiving payment tokens.
     * @param _token The address of the payment token.
     */
    constructor(address _validator, address _vault, address _token) {
        if (_validator == address(0)) revert ZeroAddress();
        if (_vault == address(0)) revert ZeroAddress();
        if (_token == address(0)) revert ZeroAddress();

        validator = _validator;
        vault = _vault;
        token = _token;
    }

    /**
     * @notice Prevents direct ETH transfers to the contract.
     */
    receive() external payable {
        revert EtherTransfersNotAllowed();
    }

    fallback() external payable {
        revert EtherTransfersNotAllowed();
    }

    /**
     * @notice Updates the validator and vault addresses.
     * @param _validator The new validator address.
     * @param _vault The new vault address.
     * @param _token The new payment token.
     */
    function updateConfig(
        address _validator,
        address _vault,
        address _token
    ) external onlyOwner {
        if (_validator == address(0)) revert ZeroAddress();
        if (_vault == address(0)) revert ZeroAddress();
        if (_token == address(0)) revert ZeroAddress();

        validator = _validator;
        vault = _vault;
        token = _token;

        emit ConfigUpdated(_validator, _vault, _token);
    }

    /**
     * @notice Process a payment using an off-chain signed receipt.
     * @param _receipt The payment receipt struct containing userId, credit/token amount, and expiry.
     * @param _signature The validator’s signature approving this receipt.
     */
    function pay(
        Receipt calldata _receipt,
        bytes calldata _signature
    ) external {
        if (_receipt.creditAmount == 0 || _receipt.tokenAmount == 0)
            revert ZeroAmount();

        if (block.timestamp > _receipt.expiry) revert ReceiptExpired();

        bytes32 hash = keccak256(
            abi.encode(
                _receipt.user,
                _receipt.creditAmount,
                _receipt.tokenAmount,
                userNonce[_receipt.user],
                _receipt.expiry,
                address(this),
                block.chainid
            )
        ).toEthSignedMessageHash();

        if (hash.recover(_signature) != validator) revert InvalidSignature();

        userNonce[_receipt.user]++;

        emit PaymentProcessed(
            _receipt.user,
            _receipt.creditAmount,
            _receipt.tokenAmount
        );

        IERC20(token).safeTransferFrom(msg.sender, vault, _receipt.tokenAmount);
    }
}
