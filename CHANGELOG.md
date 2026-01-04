# Changelog

All notable changes to S3 Browser will be documented in this file.

## [0.1.0] - 2025-01-04

### Features

- **S3 Authentication**: Securely connect to any S3-compatible storage with credentials stored in system keychain
- **File Browsing**: Navigate folders and files with breadcrumb navigation
- **Multi-select Operations**: Select multiple files/folders for bulk operations
- **Bulk Delete**: Delete multiple files and folders at once
- **File Uploads**:
  - Drag and drop files and folders
  - Upload via file picker
  - Folder upload support
- **Folder Creation**: Create new folders directly in the browser
- **Search**: Filter files and folders by name
- **File Downloads**:
  - Single file downloads
  - Folder downloads as ZIP archives
- **File Operations**:
  - Rename files and folders
  - Copy files within the same bucket
  - Move files within the same bucket
  - Copy/move files across different buckets
  - Generate presigned URLs for sharing
- **Sorting**: Sort by name, size, or last modified date (ascending/descending)
- **Metadata Display**: View file metadata including size, type, and last modified date
- **Cross-platform**: Available for macOS, Windows (x64 & ARM64), and Linux

### Technical

- Built with Tauri v2 for native performance
- React frontend with TanStack Router
- Rust backend with AWS SDK for S3 operations
- Secure credential storage via system keychain
