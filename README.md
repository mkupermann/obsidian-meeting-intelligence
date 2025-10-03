# Meeting Intelligence

A comprehensive meeting assistant for Obsidian with real-time transcription, automatic action item extraction, decision detection, and intelligent vault integration. Never miss important details from your meetings again!

## ✨ Features

### 🎙️ **Real-time Recording & Transcription**
- High-quality audio recording with visual level meter
- Offline transcription using whisper-cpp (privacy-first, no cloud required)
- Support for multiple languages and model sizes
- Live meeting timer

### 🤖 **AI-Powered Intelligence**
- **Auto-Extract Action Items** - Detects TODOs and action items from conversation
- **Decision Detection** - Identifies and highlights decisions made during meetings
- **Smart Note Linking** - Automatically finds and links to related notes in your vault
- **Structured Meeting Notes** - Creates beautifully formatted meeting notes with metadata

### 📋 **Meeting Management**
- Customizable meeting templates
- Attendee tracking with defaults
- Meeting duration tracking
- Organized in dedicated folder structure

### 🔒 **Privacy & Security**
- 100% offline transcription (no cloud APIs required)
- All data stays in your vault
- No external services needed

## 🚀 Installation

1. Install [whisper-cpp](https://github.com/ggerganov/whisper.cpp) on your system
   ```bash
   # macOS (Homebrew)
   brew install whisper-cpp

   # Or build from source
   git clone https://github.com/ggerganov/whisper.cpp.git
   cd whisper.cpp
   make
   ```

2. Download Whisper models:
   - Visit [Whisper Models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
   - Download your preferred model (e.g., `ggml-base.bin`)
   - Save to: `.obsidian/plugins/meeting-intelligence/models/`

3. Install the plugin:
   - Copy plugin files to `.obsidian/plugins/meeting-intelligence/`
   - Enable in Obsidian Settings → Community Plugins

## 📖 Usage

### Starting a Meeting

1. Click the 🎙️ microphone icon in the ribbon, or
2. Use command palette: "Start Meeting Recording"

### During the Meeting

1. Enter meeting title and attendees
2. Click "▶ Start Meeting"
3. Speak naturally - the plugin will:
   - Record audio with visual feedback
   - Track meeting duration
   - Show audio levels in real-time

4. Click "⏸ Stop Meeting" when done

### After the Meeting

The plugin automatically:
1. Transcribes the audio using Whisper
2. Extracts action items (e.g., "John will prepare the report")
3. Detects decisions (e.g., "We agreed to launch next month")
4. Finds related notes in your vault
5. Creates a structured meeting note
6. Opens the note for review and editing

## ⚙️ Settings

### Transcription
- **Whisper CLI Path** - Path to whisper-cpp executable
- **Model Size** - Choose between tiny, base, small, medium (quality vs speed)
- **Language** - Auto-detect or specify language

### Meeting Notes
- **Folder** - Where to save meeting notes (default: `Meetings`)
- **Default Attendees** - Pre-fill common attendees

### AI Features
- **Auto-Extract Action Items** ✓ - Pattern-based action item detection
- **Auto-Detect Decisions** ✓ - Identify decisions from keywords
- **Auto-Link Notes** ✓ - Find related vault notes

## 📝 Meeting Note Template

```markdown
---
date: 2025-10-03
time: 14:30
attendees: John, Sarah, Michael
duration: 00:45:23
tags: meeting
---

# Weekly Standup

## Attendees
John, Sarah, Michael

## Agenda

## Discussion
[Full transcription here...]

## Action Items
- [ ] John will prepare the Q4 report
- [ ] Sarah will review the design mockups

## Decisions Made
- Launch the new feature next Tuesday
- Increase budget for marketing by 15%

## Follow-up Questions

## Related Notes
- [[Project Alpha]]
- [[Q4 Planning]]
```

## 🎯 Model Selection Guide

| Model | Size | Speed | Quality | Use Case |
|-------|------|-------|---------|----------|
| tiny | ~75 MB | ⚡⚡⚡ | ⭐⭐ | Quick notes, drafts |
| base | ~142 MB | ⚡⚡ | ⭐⭐⭐ | **Recommended** - Good balance |
| small | ~466 MB | ⚡ | ⭐⭐⭐⭐ | High accuracy needs |
| medium | ~1.5 GB | 🐌 | ⭐⭐⭐⭐⭐ | Professional use, critical meetings |

English-specific models (.en) are faster and more accurate for English-only meetings.

## 🔧 Troubleshooting

### "Whisper CLI not found"
- Verify whisper-cpp is installed: `which whisper-cli`
- Update Whisper CLI Path in settings

### "Model not found"
- Download model from [HuggingFace](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
- Save to `.obsidian/plugins/meeting-intelligence/models/`
- Ensure filename matches (e.g., `ggml-base.bin`)

### "Microphone access denied"
- Grant microphone permissions in system settings
- Restart Obsidian

### Poor transcription quality
- Use a better model (base → small → medium)
- Speak clearly, minimize background noise
- Use an external microphone for better audio

## 💡 Tips

- **Position your mic well** - 6-12 inches from your mouth is ideal
- **Use larger models for accents** - Medium model handles accents better
- **Review action items** - AI extraction is ~80-90% accurate, always review
- **Combine with other plugins** - Works great with Tasks, Calendar, and Dataview plugins

## 🤝 Integration Examples

### With Tasks Plugin
Action items are created as checkboxes `- [ ]` and can be managed with the Tasks plugin.

### With Dataview
Query all meetings:
```dataview
TABLE duration, attendees
FROM "Meetings"
WHERE contains(tags, "meeting")
SORT date DESC
```

### With Calendar
Meeting notes use YAML frontmatter with dates, perfect for Calendar plugin visualization.

## 📄 License

MIT License - see LICENSE file

## 👤 Author

Michael Kupermann

## 🙏 Credits

- Built with [Obsidian API](https://github.com/obsidianmd/obsidian-api)
- Powered by [whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- Inspired by the need for better meeting documentation

## 🔗 Links

- [Report Issues](https://github.com/mkupermann/obsidian-meeting-intelligence/issues)
- [Feature Requests](https://github.com/mkupermann/obsidian-meeting-intelligence/discussions)
- [Whisper Models](https://huggingface.co/ggerganov/whisper.cpp)
