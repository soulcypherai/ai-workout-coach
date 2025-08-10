export class IPFSService {
  private static readonly API_URL =
    import.meta.env.VITE_SERVER_URL || "http://localhost:3005";
  private static readonly UPLOAD_LIMIT = 10 * 1024 * 1024; // 10MB

  static async uploadToPinata(file: File): Promise<string> {
    // Validate file size
    if (file.size > this.UPLOAD_LIMIT) {
      throw new Error(
        `File size exceeds ${this.UPLOAD_LIMIT / (1024 * 1024)}MB limit`,
      );
    }

    // Validate file type
    if (!this.isValidFileType(file)) {
      throw new Error(
        "Invalid file type. Only images and JSON files are allowed.",
      );
    }

    const formData = new FormData();
    formData.append("file", file);

    console.log("🔄 IPFSService: Uploading file to IPFS", {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      apiUrl: `${this.API_URL}/api/ipfs/upload`,
    });

    const response = await fetch(`${this.API_URL}/api/ipfs/upload`, {
      method: "POST",
      credentials: "include", // Include cookies for authentication
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ IPFSService: Upload failed", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      throw new Error(errorData.error || "Failed to upload to IPFS");
    }

    const result = await response.json();
    console.log("✅ IPFSService: Upload successful", {
      ipfsUrl: result.ipfsUrl,
    });
    return result.ipfsUrl;
  }

  static async uploadMetadata(metadata: any): Promise<string> {
    console.log("🔄 IPFSService: Uploading metadata to IPFS", {
      metadata,
      apiUrl: `${this.API_URL}/api/ipfs/upload-metadata`,
    });

    const response = await fetch(`${this.API_URL}/api/ipfs/upload-metadata`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // Include cookies for authentication
      body: JSON.stringify({ metadata }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("❌ IPFSService: Metadata upload failed", {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
      });
      throw new Error(errorData.error || "Failed to upload metadata to IPFS");
    }

    const result = await response.json();
    console.log("✅ IPFSService: Metadata upload successful", {
      ipfsUrl: result.ipfsUrl,
    });
    return result.ipfsUrl;
  }

  static async uploadImage(imageFile: File): Promise<string> {
    return this.uploadToPinata(imageFile);
  }

  private static isValidFileType(file: File): boolean {
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/json",
    ];
    return allowedTypes.includes(file.type);
  }

  // Utility method to convert IPFS URLs to HTTP gateways
  static convertIpfsToHttp(ipfsUrl: string): string {
    if (!ipfsUrl) return ipfsUrl;
    if (ipfsUrl.startsWith("http://") || ipfsUrl.startsWith("https://")) {
      return ipfsUrl;
    }
    if (ipfsUrl.startsWith("ipfs://")) {
      const hash = ipfsUrl.replace("ipfs://", "");
      return `https://ipfs.io/ipfs/${hash}`;
    }
    return ipfsUrl;
  }
}
