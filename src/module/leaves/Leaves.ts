import { clamp, rand } from '@/core/utils/math';
import { LEAVES_NUMBER_MAX } from '@/defaults';
import { Point } from '@pixi/math';
import { ParticleContainer } from '@pixi/particles';
import { Sprite } from '@pixi/sprite';

export const DEFAULT_OPTIONS = {
    number: 50,
    width: 500,
    height: 500,
    minSize: 90,
    maxSize: 150,
    g: 0.0001, // gravity, pixel/ms^2
    minSpeed: 0.1,
    maxSpeed: 0.3,
    minDropRate: 2000,
    dropInterval: 5000,
    multiply: 3,
    autoFall: true,
};

const NUMBER_LIMIT = LEAVES_NUMBER_MAX * 1.2; // don't make too many piece leaves...
const MAX_ANCHOR_OFFSET = 5;
const PIECE_RATIO_MAX = 0.9;
const PIECE_RATIO_MIN = 0.7;
const FADING_STEP_NORMAL = 0.02;
const FADING_STEP_SPLIT = 0.1;

export default class Leaves extends ParticleContainer {
    private _number: number;

    private _width: number;
    private _height: number;

    get number() {
        return this._number;
    }

    set number(value: number) {
        this._number = value;
        this.options.number = value;
        this.updateLeaves();
    }

    options = DEFAULT_OPTIONS;

    leaves: Leaf[] = [];

    nextFallTime = performance.now();

    constructor(readonly textures: PIXI.Texture[], options: Partial<typeof DEFAULT_OPTIONS>) {
        super(NUMBER_LIMIT, { vertices: true, rotation: true, tint: true });

        Object.assign(this.options, options);

        this._width = this.options.width;
        this._height = this.options.height;
        this._number = this.options.number;

        this.updateLeaves();
    }

    updateLeaves() {
        const texturesNumber = this.textures.length;
        const delta = this._number - this.leaves.length;

        if (texturesNumber === 0 || delta === 0) return;

        if (delta >= 0) {
            for (let i = 0, leaf; i < delta; i++) {
                leaf = new Leaf(this.textures[~~rand(0, texturesNumber)], this._width, this._height, this.options);

                this.leaves.push(leaf);
                this.addChild(leaf);
            }
        } else {
            const removed = this.leaves.splice(delta);
            this.removeChild(...removed);
        }
    }

    hit(x: number, y: number) {
        const point = new Point(x, y);
        let hasOneSplit = false;

        for (let i = this.children.length - 1, leaf: Leaf; i >= 0; i--) {
            leaf = this.children[i] as Leaf;

            if (leaf.alpha > 0) {
                if (!leaf.falling) {
                    leaf.updateTransform();

                    if (leaf.containsPoint(point)) {
                        leaf.falling = true;
                    }
                } else if (!hasOneSplit && this.children.length < NUMBER_LIMIT) {
                    leaf.updateTransform();

                    if (leaf.containsPoint(point)) {
                        hasOneSplit = true;

                        for (let j = rand(2, Math.max(2, this.options.multiply)); j > 0; j--) {
                            this.addChild(Leaf.splitFrom(leaf, this._width, this._height));
                        }
                    }
                }
            }
        }
    }

    update(dt: DOMHighResTimeStamp, now: DOMHighResTimeStamp) {
        const options = this.options;

        let shouldFall = options.autoFall && now > this.nextFallTime;

        if (shouldFall) {
            // TODO: relate to wind force

            /*
             * make a variant of sinusoid!
             *
             *    |
             *  1 |_     _______     ______
             *    | \   /       \   /                  sin(t) - 0.4 + |sin(t) - 0.4|
             *    |  '-'         '-'               1 - _____________________________
             *  0 |___________________________                      2
             */

            const sin = Math.sin(now / options.dropInterval) - 0.4;

            this.nextFallTime = now + (1 - (sin + Math.abs(sin) / 2)) * options.minDropRate;
        }

        const removals = [];
        let leaf: Leaf;
        let t: number;
        let sqt: number;

        for (let i = this.children.length - 1; i >= 0; i--) {
            leaf = this.children[i] as Leaf;

            // fade-in newly grown leaves, fade-out split leaves
            leaf.alpha = clamp(leaf.alpha + leaf.fadingStep, 0, 1);

            if (leaf.falling) {
                if (leaf.y < leaf.maxY) {
                    if (leaf.vy < leaf.maxSpeed) {
                        leaf.vy += options.g * dt;
                    }

                    if (leaf.piece) {
                        leaf.rotation += leaf.vy * leaf.rotationSpeed * dt;
                    } else {
                        // ease-in-out curve, see Solution 3 from https://stackoverflow.com/a/25730573
                        t = leaf.maxRotation - Math.abs(leaf.rotation);
                        sqt = t ** 2;
                        leaf.rotation += (sqt / (2 * (sqt - t) + 1)) * leaf.rotationSpeed * dt;
                    }

                    leaf.y += leaf.vy * dt;
                } else if (leaf.piece) {
                    // remove piece leaves when they fall to ground
                    removals.push(leaf);
                } else {
                    // reset normal leaves to top when they fall to ground
                    leaf.reset(this._width);
                }
            } else if (shouldFall) {
                // drop at most one leaf at a time
                shouldFall = false;
                leaf.falling = true;
            }
        }

        if (removals.length !== 0) this.removeChild(...removals);
    }

    resize(width: number, height: number) {
        this._width = width;
        this._height = height;
    }

    _calculateBounds() {
        this._bounds.addFrame(this.transform, 0, 0, this._width, this._height);
    }

    clone() {
        return new Leaves(this.textures, {
            ...this.options,
            number: this._number,
        });
    }
}

class Leaf extends Sprite {
    // TODO: Horizontal movement
    // vx = 0;
    vy = 0;

    maxY: number; // when Y reaches this value, the leaf is considered to fall to ground
    maxSpeed: number;
    maxRotation = rand(Math.PI / 2.5, Math.PI / 1.5);

    falling = false;
    split = false;
    piece = false;

    direction: -1 | 1 = Math.random() > 0.5 ? 1 : -1;
    rotationSpeed = this.direction * rand(0.0002, 0.0005);
    fadingStep = FADING_STEP_NORMAL;

    constructor(
        texture: PIXI.Texture,
        containerWidth: number,
        containerHeight: number,
        readonly options: typeof DEFAULT_OPTIONS,
    ) {
        super(texture);

        const size = ~~rand(options.minSize, options.maxSize);
        this.width = size;
        this.height = size;

        this.anchor.set(0.5, 0.5);
        this.maxY = containerHeight + size * 0.5;
        this.maxSpeed = rand(options.minSpeed, options.maxSpeed);

        this.reset(containerWidth);
    }

    reset(containerWidth: number) {
        this.falling = false;
        this.split = false;
        this.x = rand(0, containerWidth);
        this.y = rand(-0.3, 0.3) * this.height;
        this.vy = 0;
        this.alpha = 0;
        this.fadingStep = FADING_STEP_NORMAL;

        this.rotation = this.direction * rand(0, Math.PI / 3);
    }

    static splitFrom(leaf: Leaf, containerWidth: number, containerHeight: number) {
        leaf.split = true;
        leaf.fadingStep = -FADING_STEP_SPLIT; // prepare to fade out

        const piece = new Leaf(leaf.texture, containerWidth, containerHeight, leaf.options);

        piece.piece = true;
        piece.falling = true;

        const ratio = rand(PIECE_RATIO_MIN, PIECE_RATIO_MAX);
        piece.width = leaf.width * ratio;
        piece.height = leaf.height * ratio;

        piece.vy = leaf.vy * 1.5;
        piece.rotation = leaf.rotation;
        piece.fadingStep = FADING_STEP_SPLIT;

        const ax = rand(-MAX_ANCHOR_OFFSET, MAX_ANCHOR_OFFSET);
        const ay = rand(-MAX_ANCHOR_OFFSET, MAX_ANCHOR_OFFSET);

        piece.anchor.set(ax, ay);
        piece.x = leaf.x;
        piece.y = leaf.y;

        /*
         * The accurate value should be:
         *
         * container.height + piece.height * Math.sqrt(ax ** 2 + ay ** 2)
         *
         * But using `MAX_ANCHOR_OFFSET` is faster and the error can be just ignored
         */
        piece.maxY = containerHeight + piece.height * MAX_ANCHOR_OFFSET;

        /*
         * Offset to correct position by the new transform.
         *
         *            w
         * originX = ___ * [(ax' - 0.5) * R - (ax - 0.5)]
         *            R
         *                               ax - 0.5
         *         = w * [(ax' - 0.5) - __________]
         *                                  R
         *
         * ax' = piece.anchor.x
         * ax  = leaf.anchor.x
         */
        const origin = new Point(
            piece.texture.width * (ax - 0.5 - (leaf.anchor.x - 0.5) / ratio) * rand(0.9, 1.1),
            piece.texture.height * (ay - 0.5 - (leaf.anchor.y - 0.5) / ratio) * rand(0.9, 1.1),
        );
        piece.toGlobal(origin, piece.position);

        piece.rotationSpeed = clamp(leaf.rotationSpeed, -0.003, 0.003) * rand(2, 3);
        piece.maxRotation = Infinity;

        return piece;
    }
}
