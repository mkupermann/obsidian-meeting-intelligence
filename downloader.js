const https = require('https');
const fs = require('fs');
const path = require('path');

const MODEL_URLS = {
    'tiny': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
    'tiny.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin',
    'base': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
    'base.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin',
    'small': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
    'small.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin',
    'medium': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin',
    'medium.en': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.en.bin',
    'large-v1': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v1.bin',
    'large-v2': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v2.bin',
    'large-v3': 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin'
};

class ModelDownloader {
    constructor(basePath) {
        this.basePath = basePath;
        this.modelDir = path.join(basePath, 'models');

        if (!fs.existsSync(this.modelDir)) {
            fs.mkdirSync(this.modelDir, { recursive: true });
        }
    }

    isModelDownloaded(modelSize) {
        const modelPath = path.join(this.modelDir, `ggml-${modelSize}.bin`);
        return fs.existsSync(modelPath);
    }

    async downloadModel(modelSize, progressCallback) {
        const url = MODEL_URLS[modelSize];
        if (!url) {
            throw new Error(`Unknown model size: ${modelSize}`);
        }

        const modelPath = path.join(this.modelDir, `ggml-${modelSize}.bin`);

        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Follow redirect
                    https.get(response.headers.location, (redirectResponse) => {
                        this._downloadFile(redirectResponse, modelPath, progressCallback, resolve, reject);
                    }).on('error', reject);
                } else {
                    this._downloadFile(response, modelPath, progressCallback, resolve, reject);
                }
            }).on('error', reject);
        });
    }

    _downloadFile(response, filePath, progressCallback, resolve, reject) {
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloadedSize = 0;

        const file = fs.createWriteStream(filePath);

        response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            file.write(chunk);

            if (progressCallback && totalSize > 0) {
                const progress = (downloadedSize / totalSize) * 100;
                const downloadedMB = (downloadedSize / 1024 / 1024).toFixed(1);
                const totalMB = (totalSize / 1024 / 1024).toFixed(1);
                progressCallback(progress, `${downloadedMB} MB / ${totalMB} MB`);
            }
        });

        response.on('end', () => {
            file.end();
            resolve(filePath);
        });

        response.on('error', (err) => {
            file.end();
            fs.unlinkSync(filePath);
            reject(err);
        });
    }

    getDownloadedModels() {
        if (!fs.existsSync(this.modelDir)) {
            return [];
        }

        return fs.readdirSync(this.modelDir)
            .filter(f => f.startsWith('ggml-') && f.endsWith('.bin'))
            .map(f => f.replace('ggml-', '').replace('.bin', ''));
    }

    deleteModel(modelSize) {
        const modelPath = path.join(this.modelDir, `ggml-${modelSize}.bin`);
        if (fs.existsSync(modelPath)) {
            fs.unlinkSync(modelPath);
            return true;
        }
        return false;
    }
}

module.exports = ModelDownloader;
