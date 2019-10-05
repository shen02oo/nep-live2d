import Live2DModel from '@/core/live2d/Live2DModel';
import { Renderer, Texture } from '@pixi/core';
import { DisplayObject } from '@pixi/display';

interface ExposedTextureSystem extends PIXI.systems.TextureSystem {
    initTexture(texture: PIXI.BaseTexture): PIXI.GLTexture;
}

interface ExposedBaseTexture extends PIXI.BaseTexture {
    _glTextures: { [key: number]: PIXI.GLTexture };
}

interface ExposedRenderer extends Renderer {
    CONTEXT_UID: number;
}

export default class Live2DSprite extends DisplayObject {
    textures: Texture[];

    // temporary 4x4 matrix
    // prettier-ignore
    modelTransform = new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);

    /** The scale from WebGL's context size to model's logical size. */
    drawingScaleX = 1;
    drawingScaleY = 1;

    get width() {
        return this.model.width * this.scale.x;
    }

    set width(value) {
        this.scale.x = value > 0 ? value / this.model.width : 1;
    }

    get height() {
        return this.model.height * this.scale.y;
    }

    set height(value) {
        this.scale.y = value > 0 ? value / this.model.height : 1;
    }

    static async create(modelSettingsFile: string, uid?: number) {
        const model = await Live2DModel.create(modelSettingsFile, uid);
        return new Live2DSprite(model);
    }

    private constructor(public model: Live2DModel) {
        super();

        this.textures = model.modelSettings.textures.map(file => {
            const texture = Texture.from(file);
            texture.baseTexture.on('loaded', (baseTexture: PIXI.BaseTexture) => {
                // console.warn(baseTexture._glTextures);
                // model.bindTexture()
            });
            return texture;
        });

        const originalFn = model.motionManager.startMotionByPriority.bind(model.motionManager);

        /**
         * @fires Live2DSprite#motion
         */
        model.motionManager.startMotionByPriority = async (group, index, priority) => {
            const started = await originalFn(group, index, priority);
            if (started) {
                this.emit('motion', group, index);
            }
            return started;
        };
    }

    /**
     * Performs hit action on sprite.
     *
     * @param x - The x position in world space.
     * @param y - The y position in world space.
     *
     * @fires Live2DSprite#hit
     */
    hit(x: number, y: number) {
        this.model
            .hitTest((x - this.position.x) / this.scale.x, (y - this.position.y) / this.scale.y)
            .forEach(hitAreaName => this.emit('hit', hitAreaName));
    }

    /** @override */
    render(renderer: Renderer) {
        // IMPORTANT: resetting the renderer is the only way to make Live2D core's drawing methods
        //  compatible with Pixi's drawing system
        renderer.reset();

        // set flip Y for Live2D textures
        renderer.gl.pixelStorei(WebGLRenderingContext.UNPACK_FLIP_Y_WEBGL, true);

        for (let i = 0; i < this.textures.length; i++) {
            // get corresponding WebGLTexture generated by Pixi's TextureSystem
            // ugly but it does the trick :/
            if (
                !(this.textures[i].baseTexture as ExposedBaseTexture)._glTextures[
                    (renderer as ExposedRenderer).CONTEXT_UID
                    ]
            ) {
                const glTexture = (renderer.texture as ExposedTextureSystem).initTexture(this.textures[i].baseTexture);
                this.model.bindTexture(i, glTexture.texture);
            }

            // manually bind the texture so it will be managed and automatically unbind (if necessary) by Pixi's TextureSystem
            renderer.texture.bind(this.textures[i].baseTexture, i);
        }

        this.updateTransform();

        this.drawingScaleX = this.model.logicalWidth / renderer.gl.drawingBufferWidth;
        this.drawingScaleY = -this.model.logicalHeight / renderer.gl.drawingBufferHeight; // flip Y

        const wt = this.transform.worldTransform;
        const transform = this.modelTransform;

        // put sprite's 3x3 matrix into model's 4x4 matrix
        transform[0] = wt.a * this.drawingScaleX;
        transform[1] = wt.c * this.drawingScaleY;
        transform[4] = wt.b * this.drawingScaleX;
        transform[5] = wt.d * this.drawingScaleY;
        transform[12] = wt.tx * this.drawingScaleX;
        transform[13] = wt.ty * this.drawingScaleY;

        this.model.update(transform);

        // maybe do `renderer.reset()` again?
    }
}

/**
 * @event Live2DSprite#hit
 * @param {string} - The name of hit area.
 */

/**
 * @event Live2DSprite#motion
 * @param {Live2DMotion} motion
 * @param {string} group
 * @param {number} index
 */
