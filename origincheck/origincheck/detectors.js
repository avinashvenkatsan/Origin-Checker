import exifr from 'exifr';

/**
 * Core detection engines for Origin-Checker
 */

// 1. Linguistic Pattern Detector
export function analyzeText(text) {
    if (!text) return null;
    const lowerText = text.toLowerCase();
    const aiKeywords = ["delve", "testament", "furthermore", "moreover"];
    const matchedKeywords = aiKeywords.filter(word => lowerText.includes(word));
    
    return {
        detected: matchedKeywords.length > 0,
        confidence: matchedKeywords.length > 0 ? 0.85 : 0.10,
        matches: matchedKeywords
    };
}

// 2. REAL Image Metadata & AI Signature Detector
export async function analyzeMetadata(fileBuffer) {
    try {
        // Parse the image buffer for EXIF, XMP, and software metadata strings
        const metadata = await exifr.parse(fileBuffer, {
            xmp: true, 
            exif: true,
            mergeOutput: true
        }) || {};

        let softwareUsed = "Unknown / Stripped Metadata";
        let possibleOrigin = "Unverified Image";
        let hasCameraMetadata = false;

        // Extract software signature if available
        if (metadata.Software) {
            softwareUsed = metadata.Software;
        } else if (metadata.creatorTool) {
            softwareUsed = metadata.creatorTool;
        }

        // Check for specific digital camera hardware indicators
        if (metadata.Make || metadata.Model || metadata.LensModel || metadata.ExpireTime) {
            hasCameraMetadata = true;
            possibleOrigin = `Original Photo (${metadata.Make || ''} ${metadata.Model || ''})`.trim();
        }

        // Convert metadata to a lower-case string to flag known AI / Editing footprints
        const metaString = JSON.stringify(metadata).toLowerCase();
        
        if (metaString.includes("adobe") || metaString.includes("photoshop") || metaString.includes("gimp")) {
            possibleOrigin = "Digitally Edited / Modified";
        } 
        else if (metaString.includes("midjourney") || metaString.includes("dall-e") || metaString.includes("stable diffusion") || metaString.includes("artificial intelligence")) {
            possibleOrigin = "AI Generated Content";
        }
        else if (!hasCameraMetadata && (softwareUsed.includes("unknown") || softwareUsed === "Unknown / Stripped Metadata")) {
            // Screenshots or web-saved items lack traditional camera records
            possibleOrigin = "Web Asset / Screenshot";
        }

        return {
            hasCameraMetadata,
            softwareUsed,
            possibleOrigin
        };

    } catch (error) {
        // Fallback gracefully if the file type doesn't support EXIF parsing (like plain PNGs)
        return {
            hasCameraMetadata: false,
            softwareUsed: "None (Raw Bitmap / Screenshot)",
            possibleOrigin: "Web Asset / Screenshot"
        };
    }
}
