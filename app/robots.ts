import type { MetadataRoute } from "next";

// Private Single-User-App: komplett aus dem Index halten.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
