import { error, Tagged } from '@/core/utils/log';
import { clamp } from '@/core/utils/math';

export default class SoundManager implements Tagged {
    private _volume = 0.5;

    get volume(): number {
        return this._volume;
    }

    set volume(value: number) {
        this._volume = clamp(value, 0, 1) || 0;
        this.audios.forEach(audio => (audio.volume = this._volume));
    }

    tag = SoundManager.name;

    audios: HTMLAudioElement[] = [];

    playSound(file: string) {
        const audio = new Audio(file);
        audio.volume = this._volume;

        const promise = audio.play();

        if (promise) {
            promise.catch(e => error(this, e));
        }

        this.audios.push(audio);
        audio.addEventListener('ended', () => this.audios.splice(this.audios.indexOf(audio)));

        return audio;
    }
}