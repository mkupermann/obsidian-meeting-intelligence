const { Plugin, PluginSettingTab, Setting, Notice, TFile, Modal } = require('obsidian');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const DEFAULT_SETTINGS = {
    whisperPath: '/opt/homebrew/opt/whisper-cpp/bin/whisper-cli',
    modelSize: 'base',
    language: 'auto',
    meetingNotesFolder: 'Meetings',
    attendeesDefault: '',
    autoExtractActionItems: true,
    autoDetectDecisions: true,
    autoLinkNotes: true,
    templateEnabled: true
};

const MEETING_TEMPLATE = `---
date: {{date}}
time: {{time}}
attendees: {{attendees}}
duration: {{duration}}
tags: meeting
---

# {{title}}

## Attendees
{{attendees}}

## Agenda


## Discussion
{{transcription}}

## Action Items
- [ ]

## Decisions Made


## Follow-up Questions


## Related Notes

`;

class MeetingModal extends Modal {
    constructor(app, plugin) {
        super(app);
        this.plugin = plugin;
        this.isRecording = false;
        this.audioChunks = [];
        this.startTime = null;
        this.timerInterval = null;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.addClass('meeting-intelligence-modal');

        contentEl.createEl('h2', { text: '🎙️ Meeting Intelligence' });

        // Meeting Info
        const infoContainer = contentEl.createDiv({ cls: 'meeting-info' });

        infoContainer.createEl('label', { text: 'Meeting Title:' });
        this.titleInput = infoContainer.createEl('input', {
            type: 'text',
            placeholder: 'e.g., Weekly Standup, Client Call...',
            cls: 'meeting-input'
        });

        infoContainer.createEl('label', { text: 'Attendees (comma separated):' });
        this.attendeesInput = infoContainer.createEl('input', {
            type: 'text',
            placeholder: 'John, Sarah, Michael...',
            value: this.plugin.settings.attendeesDefault,
            cls: 'meeting-input'
        });

        // Status
        this.statusEl = contentEl.createDiv({ cls: 'meeting-status' });
        this.statusEl.setText('Ready to start');

        this.timerEl = contentEl.createDiv({ cls: 'meeting-timer' });
        this.timerEl.setText('00:00:00');

        // Audio Level Meter
        const vizContainer = contentEl.createDiv({ cls: 'meeting-visualizer' });
        vizContainer.createEl('div', { text: 'Audio Level', cls: 'meeting-label' });
        const meterContainer = vizContainer.createDiv({ cls: 'meeting-meter' });
        this.meterFill = meterContainer.createDiv({ cls: 'meeting-meter-fill' });
        this.meterLabel = meterContainer.createDiv({ cls: 'meeting-meter-label', text: '0%' });

        // Transcription Progress
        this.transcribeContainer = contentEl.createDiv({
            cls: 'meeting-progress',
            attr: { style: 'display: none;' }
        });
        this.transcribeContainer.createEl('div', { text: 'Transcribing...', cls: 'meeting-label' });
        const transcribeBar = this.transcribeContainer.createDiv({ cls: 'meeting-progress-bar' });
        this.transcribeFill = transcribeBar.createDiv({ cls: 'meeting-progress-fill' });
        this.transcribeLabel = this.transcribeContainer.createDiv({ cls: 'meeting-label' });

        // Buttons
        const buttonContainer = contentEl.createDiv({ cls: 'meeting-buttons' });

        this.recordButton = buttonContainer.createEl('button', {
            text: '▶ Start Meeting',
            cls: 'meeting-button primary'
        });
        this.recordButton.onclick = () => this.toggleRecording();

        this.closeButton = buttonContainer.createEl('button', {
            text: 'Close',
            cls: 'meeting-button'
        });
        this.closeButton.onclick = () => this.close();
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            await this.stopRecording();
        }
    }

    async startRecording() {
        if (!this.titleInput.value.trim()) {
            new Notice('Please enter a meeting title');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                await this.processRecording();
            };

            // Audio level monitoring
            const audioContext = new AudioContext();
            const source = audioContext.createMediaStreamSource(stream);
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const updateLevel = () => {
                if (!this.isRecording) return;
                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const level = (average / 255) * 100;
                this.updateMicLevel(level);
                requestAnimationFrame(updateLevel);
            };
            updateLevel();

            this.mediaRecorder.start();
            this.isRecording = true;
            this.startTime = Date.now();

            this.recordButton.setText('⏸ Stop Meeting');
            this.recordButton.removeClass('primary');
            this.recordButton.addClass('stop');
            this.statusEl.setText('🔴 Recording...');
            this.titleInput.disabled = true;
            this.attendeesInput.disabled = true;

            this.timerInterval = setInterval(() => this.updateTimer(), 1000);

        } catch (error) {
            new Notice('Microphone access denied: ' + error.message);
            console.error(error);
        }
    }

    async stopRecording() {
        this.isRecording = false;
        this.mediaRecorder.stop();
        clearInterval(this.timerInterval);

        this.recordButton.setText('Processing...');
        this.recordButton.disabled = true;
        this.statusEl.setText('Processing recording...');
    }

    async processRecording() {
        const duration = this.getDuration();
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
        const arrayBuffer = await audioBlob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const tempDir = this.plugin.app.vault.adapter.basePath + '/.obsidian/plugins/meeting-intelligence/temp';
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const audioPath = path.join(tempDir, 'meeting.wav');
        fs.writeFileSync(audioPath, buffer);

        await this.transcribeAudio(audioPath, duration);
    }

    async transcribeAudio(audioPath, duration) {
        this.transcribeContainer.style.display = 'block';
        this.updateTranscribeProgress(10, 'Starting transcription...');

        const modelDir = this.plugin.app.vault.adapter.basePath + '/.obsidian/plugins/meeting-intelligence/models';
        if (!fs.existsSync(modelDir)) {
            fs.mkdirSync(modelDir, { recursive: true });
        }

        const modelPath = path.join(modelDir, `ggml-${this.plugin.settings.modelSize}.bin`);

        if (!fs.existsSync(modelPath)) {
            new Notice(`Model ${this.plugin.settings.modelSize} not found. Please download it in settings.`);
            this.resetModal();
            return;
        }

        const language = this.plugin.settings.language === 'auto' ? '' : `-l ${this.plugin.settings.language}`;
        const command = `${this.plugin.settings.whisperPath} -m "${modelPath}" ${language} -f "${audioPath}" --output-txt`;

        this.updateTranscribeProgress(30, 'Transcribing audio...');

        exec(command, { maxBuffer: 10 * 1024 * 1024 }, async (error, stdout, stderr) => {
            if (error) {
                new Notice('Transcription failed: ' + error.message);
                console.error('Transcription error:', stderr);
                this.resetModal();
                return;
            }

            this.updateTranscribeProgress(70, 'Processing transcript...');

            const txtPath = audioPath.replace('.wav', '.wav.txt');
            let transcription = '';

            if (fs.existsSync(txtPath)) {
                transcription = fs.readFileSync(txtPath, 'utf-8').trim();
                fs.unlinkSync(txtPath);
            }

            fs.unlinkSync(audioPath);

            this.updateTranscribeProgress(90, 'Creating meeting note...');

            await this.createMeetingNote(transcription, duration);

            this.updateTranscribeProgress(100, 'Complete!');

            setTimeout(() => {
                this.close();
            }, 1000);
        });
    }

    async createMeetingNote(transcription, duration) {
        const folder = this.plugin.settings.meetingNotesFolder;

        if (!await this.plugin.app.vault.adapter.exists(folder)) {
            await this.plugin.app.vault.createFolder(folder);
        }

        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0].substring(0, 5);
        const title = this.titleInput.value.trim();
        const attendees = this.attendeesInput.value.trim();

        let content = MEETING_TEMPLATE
            .replace(/{{date}}/g, date)
            .replace(/{{time}}/g, time)
            .replace(/{{title}}/g, title)
            .replace(/{{attendees}}/g, attendees)
            .replace(/{{duration}}/g, duration)
            .replace(/{{transcription}}/g, transcription);

        // Auto-extract action items
        if (this.plugin.settings.autoExtractActionItems) {
            const actionItems = this.extractActionItems(transcription);
            if (actionItems.length > 0) {
                content = content.replace('## Action Items\n- [ ] ', '## Action Items\n' + actionItems.join('\n'));
            }
        }

        // Auto-detect decisions
        if (this.plugin.settings.autoDetectDecisions) {
            const decisions = this.extractDecisions(transcription);
            if (decisions.length > 0) {
                content = content.replace('## Decisions Made\n\n', '## Decisions Made\n' + decisions.join('\n') + '\n\n');
            }
        }

        // Auto-link related notes
        if (this.plugin.settings.autoLinkNotes) {
            const links = await this.findRelatedNotes(transcription);
            if (links.length > 0) {
                content = content.replace('## Related Notes\n\n', '## Related Notes\n' + links.join('\n') + '\n\n');
            }
        }

        const fileName = `${date} - ${title}.md`;
        const filePath = `${folder}/${fileName}`;

        await this.plugin.app.vault.create(filePath, content);

        new Notice(`Meeting note created: ${fileName}`);

        // Open the note
        const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await this.plugin.app.workspace.getLeaf().openFile(file);
        }
    }

    extractActionItems(text) {
        const actionItems = [];
        const patterns = [
            /(?:will|should|need to|must|has to|gonna)\s+([^.!?\n]{10,100})/gi,
            /action item:?\s*([^.!?\n]+)/gi,
            /TODO:?\s*([^.!?\n]+)/gi,
            /\[action\]:?\s*([^.!?\n]+)/gi
        ];

        patterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const item = match[1].trim();
                if (item.length > 10 && !actionItems.includes(item)) {
                    actionItems.push(`- [ ] ${item}`);
                }
            }
        });

        return actionItems.slice(0, 10); // Limit to 10 items
    }

    extractDecisions(text) {
        const decisions = [];
        const patterns = [
            /(?:we|they|team)\s+(?:decided|agreed|concluded)\s+(?:to|that|on)\s+([^.!?\n]{10,150})/gi,
            /decision:?\s*([^.!?\n]+)/gi,
            /agreed on:?\s*([^.!?\n]+)/gi
        ];

        patterns.forEach(pattern => {
            const matches = text.matchAll(pattern);
            for (const match of matches) {
                const decision = match[1].trim();
                if (decision.length > 10 && !decisions.includes(decision)) {
                    decisions.push(`- ${decision}`);
                }
            }
        });

        return decisions.slice(0, 8); // Limit to 8 decisions
    }

    async findRelatedNotes(text) {
        const links = [];
        const files = this.plugin.app.vault.getMarkdownFiles();
        const words = text.toLowerCase().split(/\s+/);

        for (const file of files) {
            const basename = file.basename.toLowerCase();
            // Check if note name appears in transcription (at least 3 chars)
            if (basename.length >= 3 && words.some(w => w.includes(basename) || basename.includes(w))) {
                if (!links.includes(file.basename)) {
                    links.push(`- [[${file.basename}]]`);
                }
            }
        }

        return links.slice(0, 10); // Limit to 10 links
    }

    updateMicLevel(level) {
        const volumeLevel = Math.min(100, Math.max(0, level));
        this.meterFill.style.width = volumeLevel + '%';
        this.meterLabel.setText(Math.round(volumeLevel) + '%');
    }

    updateTranscribeProgress(percent, message = '') {
        this.transcribeFill.style.width = percent + '%';
        this.transcribeLabel.setText(message || percent + '%');
    }

    updateTimer() {
        if (!this.startTime) return;
        const elapsed = Date.now() - this.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        this.timerEl.setText(
            String(hours).padStart(2, '0') + ':' +
            String(minutes).padStart(2, '0') + ':' +
            String(seconds).padStart(2, '0')
        );
    }

    getDuration() {
        if (!this.startTime) return '00:00:00';
        const elapsed = Date.now() - this.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        return String(hours).padStart(2, '0') + ':' +
               String(minutes).padStart(2, '0') + ':' +
               String(seconds).padStart(2, '0');
    }

    resetModal() {
        this.recordButton.setText('▶ Start Meeting');
        this.recordButton.disabled = false;
        this.recordButton.removeClass('stop');
        this.recordButton.addClass('primary');
        this.statusEl.setText('Ready to start');
        this.titleInput.disabled = false;
        this.attendeesInput.disabled = false;
        this.transcribeContainer.style.display = 'none';
    }

    onClose() {
        if (this.isRecording) {
            this.mediaRecorder.stop();
            clearInterval(this.timerInterval);
        }
        const { contentEl } = this;
        contentEl.empty();
    }
}

class MeetingIntelligencePlugin extends Plugin {
    async onload() {
        await this.loadSettings();

        this.addRibbonIcon('microphone', 'Start Meeting', () => {
            new MeetingModal(this.app, this).open();
        });

        this.addCommand({
            id: 'start-meeting',
            name: 'Start Meeting Recording',
            callback: () => {
                new MeetingModal(this.app, this).open();
            }
        });

        this.addSettingTab(new MeetingIntelligenceSettingTab(this.app, this));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class MeetingIntelligenceSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Meeting Intelligence Settings' });

        new Setting(containerEl)
            .setName('Whisper CLI Path')
            .setDesc('Path to whisper-cpp executable')
            .addText(text => text
                .setPlaceholder('/opt/homebrew/opt/whisper-cpp/bin/whisper-cli')
                .setValue(this.plugin.settings.whisperPath)
                .onChange(async (value) => {
                    this.plugin.settings.whisperPath = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Model Size')
            .setDesc('Whisper model size (larger = better quality, slower)')
            .addDropdown(dropdown => dropdown
                .addOption('tiny', 'Tiny (~75 MB)')
                .addOption('tiny.en', 'Tiny English (~75 MB)')
                .addOption('base', 'Base (~142 MB)')
                .addOption('base.en', 'Base English (~142 MB)')
                .addOption('small', 'Small (~466 MB)')
                .addOption('small.en', 'Small English (~466 MB)')
                .addOption('medium', 'Medium (~1.5 GB)')
                .addOption('medium.en', 'Medium English (~1.5 GB)')
                .setValue(this.plugin.settings.modelSize)
                .onChange(async (value) => {
                    this.plugin.settings.modelSize = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Language')
            .setDesc('Transcription language')
            .addDropdown(dropdown => dropdown
                .addOption('auto', 'Auto-detect')
                .addOption('en', 'English')
                .addOption('de', 'German')
                .addOption('es', 'Spanish')
                .addOption('fr', 'French')
                .addOption('it', 'Italian')
                .addOption('pt', 'Portuguese')
                .addOption('ja', 'Japanese')
                .addOption('ko', 'Korean')
                .addOption('zh', 'Chinese')
                .setValue(this.plugin.settings.language)
                .onChange(async (value) => {
                    this.plugin.settings.language = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Meeting Notes Folder')
            .setDesc('Folder to save meeting notes')
            .addText(text => text
                .setPlaceholder('Meetings')
                .setValue(this.plugin.settings.meetingNotesFolder)
                .onChange(async (value) => {
                    this.plugin.settings.meetingNotesFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Default Attendees')
            .setDesc('Default attendees (comma separated)')
            .addText(text => text
                .setPlaceholder('John, Sarah, Michael...')
                .setValue(this.plugin.settings.attendeesDefault)
                .onChange(async (value) => {
                    this.plugin.settings.attendeesDefault = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'AI Features' });

        new Setting(containerEl)
            .setName('Auto-Extract Action Items')
            .setDesc('Automatically detect and extract action items from transcription')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoExtractActionItems)
                .onChange(async (value) => {
                    this.plugin.settings.autoExtractActionItems = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-Detect Decisions')
            .setDesc('Automatically detect decisions made during the meeting')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoDetectDecisions)
                .onChange(async (value) => {
                    this.plugin.settings.autoDetectDecisions = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Auto-Link Related Notes')
            .setDesc('Automatically find and link related notes from your vault')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoLinkNotes)
                .onChange(async (value) => {
                    this.plugin.settings.autoLinkNotes = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Model Download' });
        containerEl.createEl('p', {
            text: 'Download Whisper models from: https://huggingface.co/ggerganov/whisper.cpp/tree/main',
            cls: 'setting-item-description'
        });
        containerEl.createEl('p', {
            text: 'Save models to: .obsidian/plugins/meeting-intelligence/models/',
            cls: 'setting-item-description'
        });
    }
}

module.exports = MeetingIntelligencePlugin;
