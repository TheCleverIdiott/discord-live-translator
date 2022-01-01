import fs from 'fs-extra';
import path from 'path';
import {
  AudioPlayerStatus,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus
} from '@discordjs/voice';

import { audioQueue } from '../utils/AudioQueue';
import readText from '../processors/readText';
import recognizeRecording from '../processors/recognizeRecording';
import recordAudio from '../processors/recordAudio';
import settingsStorage from '../utils/settingsStorage';
import translate from '../processors/translate';
import type { CommandHandler } from '../types';

const joinCommand: CommandHandler = async (client, message, command) => {
  if (!message.member || !message.guild) {
    message.reply('an error occurred!');
    return;
  }

  if (!message.member.voice.channel) {
    message.reply('please connect to a voice channel first!');
    return;
  }

  await fs.ensureDir(path.join(__dirname, '../../cache/rec'));

  try {
    const channel = message.member.voice.channel;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      selfDeaf: false,
      selfMute: false,
      // @ts-ignore
      adapterCreator: channel.guild.voiceAdapterCreator
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20e3);

    const player = audioQueue.init(connection);
    player.play(createAudioResource(path.join(__dirname, '../../audio/connect.mp3')));

    player.once(AudioPlayerStatus.Idle, () => {
      connection.receiver.speaking.on('start', async (userId) => {
        const userSettings = await settingsStorage.get(message.guild?.id as string, userId);

        if (!userSettings) {
          return;
        }

        const fileName = await recordAudio(connection.receiver, userId);
        if (!fileName) return;

        const originalText = await recognizeRecording(fileName, userSettings.from);
        if (!originalText) return;

        const translatedText = await translate(originalText, userSettings.from, userSettings.to);

        await readText(connection, translatedText, userSettings.to);
      });
    });
  } catch (err) {
    console.error(err);
  }
};

export default joinCommand;
