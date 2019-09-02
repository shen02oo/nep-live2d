import Mka from '@/core/mka/Mka';
import { error, Tagged } from '@/core/utils/log';
import VueApp from '@/VueApp.vue';
import { EventEmitter } from '@pixi/utils';
import Vue, { VueConstructor } from 'vue';

export interface ModuleConstructor {
    new(app: App): Module;
}

export interface Module {
    name: string;
}

export class App extends EventEmitter implements Tagged {
    tag = App.name;

    readonly mka: Mka;
    readonly vueApp: VueApp;

    readonly modules: { [name: string]: Module } = {};

    constructor(vueApp: VueApp) {
        super();

        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.mka = new Mka(canvas);

        // TODO: Remove this in release
        eval('window.mka = this.mka');

        this.vueApp = vueApp;
    }

    use(M: ModuleConstructor) {
        try {
            const module = new M(this);
            this.modules[module.name] = module;
        } catch (e) {
            error(this, `Failed to create module ${M.name}`, e);
        }
    }

    async addComponent(componentClass: VueConstructor) {
        return (this.vueApp as any).addChild(componentClass) as Vue;
    }
}
