import express from "express";
import multer from "multer";

import { verifyJWTMiddleware } from "../middleware/auth.js";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images and JSON files
    if (
      file.mimetype.startsWith("image/") ||
      file.mimetype === "application/json"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"), false);
    }
  },
});

// Upload file to IPFS
router.post(
  "/upload",
  verifyJWTMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ success: false, error: "No file provided" });
      }

      console.log("🔄 IPFS Upload: Processing file:", {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        userId: req.user?.userId,
      });

      // Create FormData for Pinata
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([req.file.buffer]),
        req.file.originalname,
      );

      const response = await fetch(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PINATA_JWT_KEY}`,
          },
          body: formData,
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "Pinata upload failed:",
          response.status,
          response.statusText,
          errorText,
        );
        return res.status(500).json({
          success: false,
          error: "Failed to upload to IPFS",
        });
      }

      const result = await response.json();
      console.log("✅ IPFS Upload: Success", {
        ipfsHash: result.IpfsHash,
        userId: req.user?.userId,
      });

      res.json({
        success: true,
        ipfsHash: result.IpfsHash,
        ipfsUrl: `ipfs://${result.IpfsHash}`,
      });
    } catch (error) {
      console.error("IPFS upload error:", error);
      res.status(500).json({
        success: false,
        error: "Internal server error",
      });
    }
  },
);

// Upload metadata to IPFS
router.post("/upload-metadata", verifyJWTMiddleware, async (req, res) => {
  try {
    const { metadata } = req.body;

    if (!metadata) {
      return res
        .status(400)
        .json({ success: false, error: "No metadata provided" });
    }

    console.log(
      "🔄 IPFS Metadata Upload: Processing metadata for user:",
      req.user?.userId,
    );

    // Create metadata blob
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });

    // Create FormData for Pinata
    const formData = new FormData();
    formData.append("file", metadataBlob, "metadata.json");

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT_KEY}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        "Pinata metadata upload failed:",
        response.status,
        response.statusText,
        errorText,
      );
      return res.status(500).json({
        success: false,
        error: "Failed to upload metadata to IPFS",
      });
    }

    const result = await response.json();
    console.log("✅ IPFS Metadata Upload: Success", {
      ipfsHash: result.IpfsHash,
      userId: req.user?.userId,
    });

    res.json({
      success: true,
      ipfsHash: result.IpfsHash,
      ipfsUrl: `ipfs://${result.IpfsHash}`,
    });
  } catch (error) {
    console.error("IPFS metadata upload error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
