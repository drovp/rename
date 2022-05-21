let lastGlobalWheel = 0;

window.addEventListener('wheel', () => {
	lastGlobalWheel = Date.now();
});

export const easeOutQuad = (x: number) => 1 - (1 - x) * (1 - x);
export const easeOutQuart = (x: number) => 1 - Math.pow(1 - x, 4);
export const easeOutExpo = (x: number) => (x === 1 ? 1 : 1 - Math.pow(2, -10 * x));

export type Easing = (time: number) => number;

export interface Options {
	/**
	 * Milliseconds.
	 */
	speed: number;
	/**
	 * Default easing function.
	 *
	 * You can use one of the built in exported easings:
	 *
	 * - `easeOutQuad`: slowest (default)
	 * - `easeOutQuart`: middle ground
	 * - `easeOutExpo`: fastest
	 */
	easing: Easing;
	/**
	 * Wether to take over wheel.
	 */
	replaceWheel: boolean;
	/**
	 * Wether vertical scrolls should scroll the element horizontally, and vice
	 * versa.
	 */
	flipWheel: boolean;
	/**
	 * Easing function to use for wheel events.
	 */
	wheelEasing: Easing;
}

export interface Position {
	left: number;
	top: number;
}

export interface ScrollLength {
	width: number;
	height: number;
}

/**
 * Interface to replace native smooth scrolling on an element.
 *
 * Native scrolling APIs are horrendous when using `behavior: 'smooth'` as when
 * scrollTo or scrollBy is called while previous one is still animating, it
 * starts animating from the current position, not from the target of the
 * ongoing animation. This results in glitchy, unresponsive, and downright
 * broken scrolling when these methods are called quickly one after another,
 * as the native implementation just eats them up.
 */
export class ElementScroller {
	element: HTMLElement;
	options: Options;
	easing: Easing;
	startPosition: Position;
	targetPosition: Position;
	animationStart: number;
	animationId: number | null;

	constructor(element: HTMLElement, options: Partial<Options> = {}) {
		this.element = element;
		this.options = {
			speed: 300,
			easing: easeOutQuad,
			replaceWheel: false,
			flipWheel: false,
			wheelEasing: easeOutQuart,
			...options,
		};
		this.easing = easeOutQuart;
		this.targetPosition = this.startPosition = this.getPosition();
		this.animationStart = 0;
		this.animationId = null;

		if (this.options.replaceWheel) element.addEventListener('wheel', this.handleWheel);
		element.addEventListener('scroll', this.handleScroll, {passive: true});
	}

	getPosition(): Position {
		return {left: this.element.scrollLeft, top: this.element.scrollTop};
	}

	getScrollLength(): ScrollLength {
		return {
			width: this.element.scrollWidth - this.element.clientWidth,
			height: this.element.scrollHeight - this.element.clientHeight,
		};
	}

	setPosition(position: Position) {
		this.element.scrollLeft = position.left;
		this.element.scrollTop = position.top;
	}

	loop = () => {
		const timeFraction = (Date.now() - this.animationStart) / this.options.speed;
		if (timeFraction >= 1) {
			this.setPosition(this.targetPosition);
			// this needs to be set after setPosition, as it is used inside scroll handler
			this.animationId = null;
		} else {
			const {left: startLeft, top: startTop} = this.startPosition;
			const {left: targetLeft, top: targetTop} = this.targetPosition;
			this.setPosition({
				left: startLeft + (1 - this.easing(timeFraction) * (startLeft - targetLeft)),
				top: startTop + (1 - this.easing(timeFraction) * (startTop - targetTop)),
			});
			this.animationId = requestAnimationFrame(this.loop);
		}
	};

	scrollTo({left, top}: Partial<Position>, {easing = this.options.easing}: {easing?: Easing} = {}) {
		const now = Date.now();
		if (now - lastGlobalWheel < 300) return;
		this.animationStart = now;
		this.easing = easing;
		this.startPosition = this.getPosition();
		const scrollLength = this.getScrollLength();
		top = top === Infinity ? scrollLength.height : top ?? this.startPosition.top;
		left = left === Infinity ? scrollLength.width : left ?? this.startPosition.left;
		this.targetPosition = {
			left: Math.min(scrollLength.width, Math.max(0, left)),
			top: Math.min(scrollLength.height, Math.max(0, top)),
		};
		this.loop();
	}

	scrollBy({left = 0, top = 0}: Partial<Position>, options: {easing?: Easing} = {}) {
		this.scrollTo({left: this.targetPosition.left + left, top: this.targetPosition.top + top}, options);
	}

	/**
	 * Continuously scroll element.
	 */
	scroll({
		top = 0,
		left = 0,
	}: {
		/**
		 * Vertical speed in pixels per second. Use negative number to scroll back.
		 */
		top?: number;
		/**
		 * Horizontal speed in pixels per second. Use negative number to scroll back.
		 */
		left?: number;
	}) {
		let initPos = this.getPosition();
		let initTime = Date.now();
		const scroll = () => {
			const scrollLength = this.getScrollLength();
			const time = Date.now();
			const scrollFactor = (time - initTime) / 1000;
			let newPos = {
				top: Math.max(0, Math.min(scrollLength.height, initPos.top + scrollFactor * top)),
				left: Math.max(0, Math.min(scrollLength.width, initPos.left + scrollFactor * left)),
			};

			// If we scroll past max boundaries, adjust initPos so that when
			// additional content gets added in, the scrolling will seamlessly pick
			// up and not just jump straight to the end.
			if (left > 0 && newPos.left >= scrollLength.width) initPos.left = scrollLength.width - scrollFactor * left;
			if (top > 0 && newPos.top >= scrollLength.height) initPos.top = scrollLength.height - scrollFactor * top;

			this.element.scrollLeft = newPos.left;
			this.element.scrollTop = newPos.top;
			animationId = requestAnimationFrame(scroll);
		};

		let animationId = requestAnimationFrame(scroll);

		return () => {
			cancelAnimationFrame(animationId);
		};
	}

	handleWheel = (event: WheelEvent) => {
		event.preventDefault();
		event.stopPropagation();
		this.scrollBy(
			this.options.flipWheel ? {left: event.deltaY, top: event.deltaX} : {left: event.deltaX, top: event.deltaY},
			{easing: this.options.wheelEasing}
		);
	};

	handleScroll = () => {
		if (!this.animationId) this.startPosition = this.targetPosition = this.getPosition();
	};

	destroy() {
		this.element.removeEventListener('wheel', this.handleWheel);
		this.element.removeEventListener('scroll', this.handleScroll);
		if (this.animationId) cancelAnimationFrame(this.animationId);
	}
}
