# Privacy Policy for CopyLens

**Last updated: June 2025**

## Overview

CopyLens is a browser extension that performs local OCR (Optical Character Recognition) entirely within your browser. It allows you to manually select a visible area on a web page, and the extension captures a screenshot of that area to recognize text locally — without sending any data to external servers.

## Data Collection and Processing

### What CopyLens Processes

When you use CopyLens, the extension may temporarily process the content visible in your selected area of a web page. This may include:

- Text visible on the page
- Images, PDF previews, document previews, and canvas content within the selected area
- Screenshots of the selected visible area of the current tab

### How Data Is Processed

- **All OCR recognition is performed locally in your browser.** The captured screenshot of your selected area is processed entirely within an offscreen document that belongs to the extension itself.
- **No screenshots, web page content, OCR results, browsing history, or user activity are uploaded to any server.**
- The extension does not use any remote code, remote scripts, or CDN resources for OCR processing. All OCR engine files (worker, WebAssembly, language data) are bundled within the extension package.

### Data Storage

- The extension uses the browser's local storage (`chrome.storage.local`) solely to save your OCR language preference (e.g., English, Simplified Chinese, or both).
- No OCR results, screenshots, or personal data are stored persistently by the extension.

### Data Sharing

- CopyLens does **not** sell, share, rent, or transfer any user data to third parties.
- CopyLens does **not** collect, track, or analyze your browsing behavior, page content, or usage patterns.

## Permissions

CopyLens requests the following browser permissions, each used solely to enable the core area-selection OCR functionality:

| Permission | Purpose |
|-----------|---------|
| `activeTab` | Access the current tab for screenshot capture — only activated when you click the extension icon |
| `scripting` | Enable communication between the extension popup and the web page |
| `storage` | Save your OCR language preference locally |
| `offscreen` | Create an offscreen document in the extension's own context to run OCR without being affected by the web page's content security policy |
| `tabs` | Access tab information needed for screenshot capture |
| `<all_urls>` (host) | Allow the extension to function on any web page you choose to use it on |

All permissions are only used when you actively trigger the area-selection OCR feature by clicking the extension icon and selecting an area on the page.

## Third-Party Services

CopyLens does not integrate with or rely on any third-party analytics, advertising, tracking, or cloud services. The OCR engine (Tesseract.js) runs entirely within your browser using files bundled in the extension.

## Children's Privacy

CopyLens does not knowingly collect or process personal information from anyone, including children under the age of 13.

## Changes to This Policy

Any changes to this privacy policy will be reflected in this document and included in extension updates.

## Contact

If you have questions about this privacy policy or the extension, please contact:

**Email:** ansehen11@gmail.com
