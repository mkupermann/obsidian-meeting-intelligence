const fs = require('fs');

class AudioConverter {
    constructor() {
        this.audioContext = null;
    }

    async convertBlobToWav(audioBlob) {
        try {
            const arrayBuffer = await audioBlob.arrayBuffer();

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            const wav = this.audioBufferToWav(audioBuffer);

            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }

            return wav;

        } catch (error) {
            console.error('Audio conversion error:', error);
            throw new Error('Failed to convert audio: ' + error.message);
        }
    }

    audioBufferToWav(audioBuffer) {
        const sampleRate = 16000;
        const numChannels = 1;

        let audioData;
        if (audioBuffer.numberOfChannels > 1) {
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            audioData = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) {
                audioData[i] = (left[i] + right[i]) / 2;
            }
        } else {
            audioData = audioBuffer.getChannelData(0);
        }

        const resampledData = this.resample(
            audioData,
            audioBuffer.sampleRate,
            sampleRate
        );

        const int16Data = new Int16Array(resampledData.length);
        for (let i = 0; i < resampledData.length; i++) {
            const s = Math.max(-1, Math.min(1, resampledData[i]));
            int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        const wavBuffer = this.encodeWav(int16Data, sampleRate, numChannels);

        return wavBuffer;
    }

    resample(audioData, sourceSampleRate, targetSampleRate) {
        if (sourceSampleRate === targetSampleRate) {
            return audioData;
        }

        const ratio = sourceSampleRate / targetSampleRate;
        const newLength = Math.round(audioData.length / ratio);
        const result = new Float32Array(newLength);

        for (let i = 0; i < newLength; i++) {
            const sourceIndex = i * ratio;
            const indexFloor = Math.floor(sourceIndex);
            const indexCeil = Math.min(indexFloor + 1, audioData.length - 1);
            const frac = sourceIndex - indexFloor;

            result[i] = audioData[indexFloor] * (1 - frac) + audioData[indexCeil] * frac;
        }

        return result;
    }

    encodeWav(samples, sampleRate, numChannels) {
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const byteRate = sampleRate * blockAlign;
        const dataSize = samples.length * bytesPerSample;

        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);

        const writeString = (offset, string) => {
            for (let i = 0; i < string.length; i++) {
                view.setUint8(offset + i, string.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, 16, true);
        writeString(36, 'data');
        view.setUint32(40, dataSize, true);

        for (let i = 0; i < samples.length; i++) {
            view.setInt16(44 + i * 2, samples[i], true);
        }

        return Buffer.from(buffer);
    }

    async saveWavFile(wavBuffer, filePath) {
        try {
            fs.writeFileSync(filePath, wavBuffer);
            return true;
        } catch (error) {
            console.error('Failed to save WAV file:', error);
            throw new Error('Failed to save audio file: ' + error.message);
        }
    }
}

module.exports = { AudioConverter };
