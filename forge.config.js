// forge.config.js
module.exports = {
  packagerConfig: {
    // Common configuration options for both macOS and Windows
    // For example, if you have an icon, you might add it here:
    // icon: './path/to/your/icon', // macOS: .icns, Windows: .ico (without extension)

    // macOS Specific Signing Configuration
    // This section will only apply when building for 'darwin' platform
    osxSign: {
      // Use an environment variable for your Apple Developer ID Identity
      identity: process.env.APPLE_SIGNING_IDENTITY,
      'hardened-runtime': true, // Recommended for macOS Catalina+ for security
      entitlements: './build/entitlements.mac.plist', // Path to your entitlements file
      'entitlements-inherit': './build/entitlements.mac.plist', // Ensures child processes inherit entitlements
      'gatekeeper-assess': false // Set to true if you want Gatekeeper assessment during build (optional)
    },
    // macOS Notarization Configuration (required for macOS Catalina and above)
    osxNotarize: {
      // Your Apple Team ID (can be hardcoded if not sensitive, but env var is safer)
      teamId: process.env.APPLE_TEAM_ID,
      // It's highly recommended to use environment variables for Apple ID and password:
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD, // Use an app-specific password!
    },

    // Windows Specific Signing Configuration
    win32metadata: {
      // Company Name is often part of your certificate, can be an env var if it changes
      CompanyName: process.env.WIN_COMPANY_NAME || 'Your Company Name',
      ProductName: 'MongoDB Client',
      // ... other metadata like FileDescription, OriginalFilename etc.
    },
  },
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32'],
    },
    {
      name: '@electron-forge/maker-squirrel', // For Windows installers
      platforms: ['win32'],
      config: {
        setupIcon: './path/to/your/icon.ico', // Path to your Windows app icon
        // Point to your PFX certificate file and password (preferably via env variables)
        certificateFile: process.env.WIN_CERT_FILE, // Path to your .pfx certificate
        certificatePassword: process.env.WIN_CERT_PASSWORD, // Password for the .pfx file
        // OR, if your certificate is installed in the Windows certificate store:
        // certificateSubjectName: process.env.WIN_CERT_SUBJECT_NAME, // e.g., 'CN=Your Company, O=Your Org'
        // certificateSha1: process.env.WIN_CERT_SHA1, // The SHA-1 thumbprint of the certificate
      },
    },
    // ... other makers you might have (e.g., for Linux)
  ],
  plugins: [], // Assuming no plugins for this review
};
