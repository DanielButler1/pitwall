// What other parts of the app need from the Lab.

/** Unpacks a website share link (`https://pitwall.phaseo.app/share#…`, or the part after `#`) into the Lab; open `/lab/<id>` with the result. */
export { openSharedUniverse } from "./engine/share";
/** The part after `#` of a share link: route `/share#X` to `/lab/share?d=X` and the Lab does the rest. */
export { shareFragment } from "./engine/codec";
/** Show a universe across the whole app (as the website's `/u/<id>/…`), or go back to reality. */
export { enterUniverse, leaveUniverse, enteredStore } from "./engine/store";
