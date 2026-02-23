# 📤 File Share

A modern, secure, and self-hosted file sharing application built with Next.js. Share files instantly without relying on external services or requiring user accounts.

![File Share Demo](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Next.js](https://img.shields.io/badge/Next.js-16.1.0-black)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Self-Hosted](https://img.shields.io/badge/Self--Hosted-100%25-orange)

## 🌟 Features

### 🔒 **Privacy & Security**
- **100% Self-Hosted** - Files never leave your server
- **No External Dependencies** - Zero third-party file storage services
- **Auto-Cleanup** - Files automatically deleted after 1 hour
- **Unique URLs** - Each file gets a unique, secure download link
- **Local Storage Only** - All files stored in `public/uploads/` on your machine

### ⚡ **User Experience**
- **Drag & Drop Interface** - Modern, intuitive file upload
- **Instant Upload** - Fast file processing with real-time feedback
- **No Account Required** - Share files without user registration
- **Mobile Responsive** - Works perfectly on all devices
- **Copy to Clipboard** - One-click link copying
- **File Type Icons** - Visual file type recognition

### 🛠️ **Technical Features**
- **Built with Next.js 16.1** - Modern React framework
- **TypeScript Support** - Full type safety
- **File Size Limits** - Configurable upload limits (default: 10MB)
- **Multiple File Types** - Support for all file formats
- **Clean Architecture** - Well-organized, maintainable code

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- pnpm, npm, or yarn

### Installation

1. **Clone & Install**
   ```bash
   git clone <your-repo-url>
   cd file-share
   pnpm install
   ```

2. **Development Mode**
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

3. **Production Build**
   ```bash
   pnpm build
   pnpm start
   ```

## 📁 Project Structure

```
file-share/
├── app/
│   ├── api/upload/          # File upload API endpoint
│   │   └── route.ts         # Upload handler with cleanup logic
│   ├── components/          # React components
│   │   └── FileUpload.tsx   # Main upload interface
│   ├── layout.tsx           # App layout and metadata
│   └── page.tsx             # Home page
├── public/
│   └── uploads/             # 📁 Local file storage directory
├── package.json             # Dependencies (Next.js, React only)
├── next.config.js           # Next.js configuration
└── tsconfig.json            # TypeScript configuration
```

## 🔧 Configuration

### File Size Limits
Modify in `next.config.js`:
```javascript
experimental: {
  serverActions: {
    bodySizeLimit: '10mb', // Change this value
  },
}
```

### Auto-Cleanup Timer
Modify in `app/api/upload/route.ts`:
```typescript
const oneHourAgo = Date.now() - 60 * 60 * 1000; // Change cleanup time
```

### Upload Directory
The upload directory is set in `route.ts`:
```typescript
const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');
```

## 🛡️ Security Features

### **Local-Only Storage**
- Files stored directly on your server filesystem
- No external cloud storage services
- Complete control over your data

### **Automatic Cleanup**
- Files older than 1 hour are automatically deleted
- Cleanup runs probabilistically on each upload (10% chance)
- Prevents server storage bloat

### **Secure File Naming**
- Unique IDs generated using timestamp + random string
- Original filenames preserved for user reference
- Prevents file conflicts and unauthorized access

### **No External Dependencies**
- Zero third-party file storage services
- No API keys or external accounts required
- Completely self-contained application

## 📡 API Endpoints

### POST `/api/upload`
Upload a file to the server.

**Request:**
- `Content-Type: multipart/form-data`
- Body: `FormData` with `file` field

**Response:**
```json
{
  "success": true,
  "link": "/uploads/filename.ext", 
  "filename": "original-name.ext",
  "size": 1024
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Error description"
}
```

## 🔄 File Lifecycle

1. **Upload**: File uploaded via drag-drop or file picker
2. **Processing**: Unique filename generated, file saved to `/public/uploads/`
3. **Sharing**: Shareable URL generated (`/uploads/unique-id.ext`)
4. **Access**: Direct download from your server
5. **Cleanup**: Automatic deletion after 1 hour

## 🌐 Deployment Options

### **Local Development**
```bash
pnpm dev
# Access: http://localhost:3000
```

### **Production Server**
```bash
pnpm build
pnpm start
# Configure reverse proxy (nginx) for public access
```

### **Docker Deployment**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## 🎨 Customization

### **Styling**
- CSS-in-JS styling in components
- Easy to modify colors, animations, and layouts
- Responsive design built-in

### **File Type Support**
Add new file type icons in `FileUpload.tsx`:
```typescript
const fileIcons: Record<string, string> = {
  // Add new file types here
  newtype: '🆕',
};
```

### **Features to Add**
- Password protection for files
- Custom expiry times
- File compression
- Batch uploads
- Download statistics

## 🏃‍♂️ Performance

- **Upload Speed**: Direct filesystem writes (no network overhead)
- **Download Speed**: Static file serving via Next.js
- **Storage**: Local SSD/HDD performance
- **Scalability**: Limited by server resources

## 🐛 Troubleshooting

### **Upload Fails**
- Check file size limits in `next.config.js`
- Verify `public/uploads/` directory permissions
- Check available disk space

### **Files Not Accessible**
- Ensure `public/uploads/` exists and is writable
- Check file permissions after upload
- Verify Next.js static file serving is working

### **Cleanup Issues**
- Check filesystem permissions for deletion
- Monitor disk space usage
- Adjust cleanup frequency in `route.ts`

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📊 Technical Details

- **Framework**: Next.js 16.1 (App Router)
- **Language**: TypeScript
- **Storage**: Local filesystem
- **File Handling**: Node.js `fs` module
- **Frontend**: React 19 with CSS-in-JS
- **Build**: Standalone output for production

---

**🔐 Privacy-First File Sharing - Your files, your server, your control.**