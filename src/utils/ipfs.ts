/**
 * Convert IPFS URLs from ipfs:// protocol to HTTP gateway URLs
 * @param ipfsUrl - The IPFS URL (e.g., ipfs://QmXG2Zz71rcVfztUXdLwW6kGvgqUbQq6UyrNxMJPcUgcnY)
 * @returns HTTP gateway URL that browsers can display
 */
export function convertIpfsToHttp(ipfsUrl: string): string {
  if (!ipfsUrl) return ipfsUrl;

  // If it's already an HTTP URL, return as is
  if (ipfsUrl.startsWith("http://") || ipfsUrl.startsWith("https://")) {
    return ipfsUrl;
  }

  // If it's an ipfs:// URL, convert to HTTP gateway
  if (ipfsUrl.startsWith("ipfs://")) {
    const hash = ipfsUrl.replace("ipfs://", "");
    // Use multiple gateways for redundancy
    const gateways = [
      "https://ipfs.io/ipfs/",
      "https://gateway.pinata.cloud/ipfs/",
      "https://cloudflare-ipfs.com/ipfs/",
      "https://dweb.link/ipfs/",
    ];

    // Return the first gateway (you can implement fallback logic if needed)
    return gateways[0] + hash;
  }

  // If it doesn't match any pattern, return as is
  return ipfsUrl;
}

/**
 * Extract IPFS hash from various URL formats
 * @param url - The URL to extract hash from
 * @returns IPFS hash or null if not found
 */
export function extractIpfsHash(url: string): string | null {
  if (!url) return null;

  // Handle ipfs:// URLs
  if (url.startsWith("ipfs://")) {
    return url.replace("ipfs://", "");
  }

  // Handle HTTP gateway URLs
  const httpPatterns = [
    /https?:\/\/[^\/]+\/ipfs\/([a-zA-Z0-9]+)/,
    /ipfs\/([a-zA-Z0-9]+)/,
  ];

  for (const pattern of httpPatterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Convert IPFS URLs with fallback support for better reliability
 * @param ipfsUrl - The IPFS URL
 * @param fallbackIndex - Which gateway to use (0-3)
 * @returns HTTP gateway URL
 */
export function convertIpfsToHttpWithFallback(
  ipfsUrl: string,
  fallbackIndex: number = 0,
): string {
  if (!ipfsUrl) return ipfsUrl;

  // If it's already an HTTP URL, return as is
  if (ipfsUrl.startsWith("http://") || ipfsUrl.startsWith("https://")) {
    return ipfsUrl;
  }

  // If it's an ipfs:// URL, convert to HTTP gateway
  if (ipfsUrl.startsWith("ipfs://")) {
    const hash = ipfsUrl.replace("ipfs://", "");
    const gateways = [
      "https://ipfs.io/ipfs/",
      "https://gateway.pinata.cloud/ipfs/",
      "https://cloudflare-ipfs.com/ipfs/",
      "https://dweb.link/ipfs/",
    ];

    // Use the specified fallback index, defaulting to 0
    const gatewayIndex = Math.min(fallbackIndex, gateways.length - 1);
    return gateways[gatewayIndex] + hash;
  }

  // If it doesn't match any pattern, return as is
  return ipfsUrl;
}
