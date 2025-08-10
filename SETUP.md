# Setup Guide for Zora Coin Creation

This guide will help you set up the Zora coin creation feature in the AI Pitch Room Interface.

## Prerequisites

1. **Node.js** (v18 or higher)
2. **pnpm** package manager
3. **Wallet** (MetaMask, Rainbow, etc.) with Base Sepolia testnet configured
4. **Pinata Account** for IPFS uploads

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Server Configuration
VITE_SERVER_URL=http://localhost:3005

# Pinata Configuration (Required for Zora coins)
VITE_PINATA_JWT_KEY=your_pinata_jwt_key_here

# Add other existing variables as needed...
```

## Getting Your Pinata API Key

1. **Sign up** at [Pinata](https://pinata.cloud/)
2. **Navigate** to API Keys section
3. **Create** a new API key with these permissions:
   - `pinFileToIPFS`
   - `pinJSONToIPFS`
4. **Copy** the JWT token
5. **Add** it to your `.env` file as `VITE_PINATA_JWT_KEY`

## Installation

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Start server (in separate terminal)
pnpm dev:server
```

## Using the Zora Coin Creation Feature

### Step 1: Connect Your Wallet

- Ensure your wallet is connected to Base Sepolia testnet
- The app will detect your wallet connection status
- Get free testnet ETH from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

### Step 2: Select Music

- Choose a music message from your chat history
- The music file will be automatically downloaded

### Step 3: Fill Coin Details

- **Name**: Enter a descriptive name for your coin
- **Symbol**: Trading symbol (auto-generated, max 6 characters)
- **Description**: Detailed description of your coin
- **Cover Image**: Upload an image for your coin

### Step 4: Create the Coin

1. Click "Prepare Coin" to upload metadata to IPFS
2. Click "Create Coin" to deploy the token contract
3. Approve the transaction in your wallet
4. Wait for confirmation

## Technical Details

### Coin Metadata Structure

```json
{
  "name": "Your Coin Name",
  "symbol": "SYMBOL",
  "description": "Description of your coin",
  "image": "ipfs://Qm...",
  "attributes": [
    {
      "trait_type": "Type",
      "value": "Music Coin"
    },
    {
      "trait_type": "Artist",
      "value": "Your Name"
    }
  ]
}
```

### Network Configuration

- **Network**: Base Sepolia testnet
- **Currency**: ETH (ZORA not available on testnet)
- **Gas**: User pays their own gas fees (free testnet ETH available)

### Error Handling

- Wallet connection required
- Valid image file required
- All fields must be filled
- IPFS upload errors are handled gracefully

## Troubleshooting

### Common Issues

1. **"Wallet Not Connected"**

   - Ensure your wallet is connected to Base mainnet
   - Try refreshing the page

2. **"Failed to upload to Pinata"**

   - Check your Pinata API key is correct
   - Verify the key has proper permissions

3. **"Transaction Failed"**

   - Ensure you have enough testnet ETH for gas fees
   - Check you're on Base Sepolia testnet
   - Get free testnet ETH from [Base Sepolia Faucet](https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet)

4. **"Coin parameters not ready"**
   - Try refreshing the page
   - Check your internet connection

### Support

If you encounter issues:

1. Check the browser console for error messages
2. Verify your environment variables are set correctly
3. Ensure your wallet is properly configured for Base mainnet
 