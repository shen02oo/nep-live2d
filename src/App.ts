import Mka from '@/core/mka/Mka';
import VueApp from '@/VueApp.vue';
import { VueConstructor } from 'vue';

export interface Module {
    install(app: App): void;
}

export class App {
    readonly mka: Mka;
    readonly vueApp: VueApp;

    constructor(vueApp: VueApp) {
        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        this.mka = new Mka(canvas);

        this.vueApp = vueApp;
    }

    use(module: Module) {
        module.install(this);
    }

    addComponent(componentClass: VueConstructor) {
        this.vueApp.$options.methods!.addChild.call(this.vueApp, componentClass);
    }
}