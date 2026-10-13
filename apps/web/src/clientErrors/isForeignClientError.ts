import { findFirstAppFrame } from "@/clientErrors/findFirstAppFrame";

const CROSS_ORIGIN_SCRIPT_ERROR = "Script error.";
const EXTENSION_FRAME = /\b(?:chrome|moz|safari-web)-extension:\/\//;

type IsForeignClientErrorParams = {
  message: string;
  stack: string;
  origin: string;
};

export function isForeignClientError({ message, stack, origin }: IsForeignClientErrorParams): boolean {
  if (message === CROSS_ORIGIN_SCRIPT_ERROR && stack.trim() === "") {
    return true;
  }
  return EXTENSION_FRAME.test(stack) && findFirstAppFrame({ stack, origin }) === undefined;
}
