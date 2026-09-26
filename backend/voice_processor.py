import re
from typing import Any, Dict, Optional

class IVoiceProcessor:
    """Interface for the Voice Processor."""
    def process_voice_input(self, text: str, context: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError("IVoiceProcessor.process_voice_input must be implemented")

class VoiceProcessor(IVoiceProcessor):
    def __init__(self):
        self.filler_words = [
            r"\buh\b", r"\bum\b", r"\bI think I did\b", 
            r"\bI did\b", r"\bI've done\b", r"\bor\b", r"\bso\b"
        ]

    def _normalize(self, text: str) -> str:
        text = text.lower().strip()
        for pattern in self.filler_words:
            text = re.sub(pattern, "", text, flags=re.IGNORECASE)
        return " ".join(text.split())

    def _extract(self, text: str) -> Dict[str, Optional[float]]:
        extracted = {"reps": None, "weight": None}
        
        # Weight extraction (e.g., "100kg", "100 kg", "100 lbs")
        weight_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:kg|lbs)", text)
        if weight_match:
            extracted["weight"] = float(weight_match.group(1))
        
        # Reps extraction
        # Look for "X reps" or "X hits"
        reps_match = re.search(r"(\d+)\s*(?:reps|hits)", text)
        if reps_match:
            extracted["reps"] = int(reps_match.group(1))
        else:
            # Fallback: if there's a number and it's not the weight, it might be reps
            # but only if it's not followed by something else.
            # Or just look for "did X", "got X", "at X"
            nums = re.findall(r"(\d+)", text)
            remaining_nums = []
            if extracted["weight"]:
                # Remove the weight number from candidates
                weight_val = str(int(extracted["weight"]))
                # This is tricky because weight might be 100.0
                # Let's use the weight_match group 1
                weight_str = weight_match.group(1)
                # We only remove one instance of the weight string
                found_weight = False
                for n in nums:
                    if not found_weight and n == weight_str:
                        found_weight = True
                        continue
                    remaining_nums.append(n)
            else:
                remaining_nums = nums
            
            if remaining_nums:
                # If "failed at 8", "got 7", the number is reps
                extracted["reps"] = int(remaining_nums[0])
        
        return extracted

    def process_voice_input(self, text: str, context: Dict[str, Any]) -> Dict[str, Any]:
        try:
            target_reps = context.get("target_reps", 0)
            target_weight = context.get("target_weight", 0.0)
            
            normalized = self._normalize(text)
            extracted = self._extract(normalized)
            
            reps = extracted["reps"]
            weight = extracted["weight"]
            
            # Contextualization
            # 1. Handle "couldnt do any" or "zero reps"
            if "couldnt do any" in normalized or "zero reps" in normalized:
                reps = 0
            
            # 2. Handle "did it" / "done" / "success" shorthand
            elif "did it" in normalized or "done" in normalized or (reps is None and not any(char.isdigit() for char in normalized)):
                reps = target_reps
            
            # Final defaults
            final_reps = reps if reps is not None else target_reps
            final_weight = weight if weight is not None else target_weight
            
            # Status determination
            status = "success"
            if "failed" in normalized or "couldnt" in normalized:
                status = "failure"
            elif final_reps < target_reps:
                status = "partial"
            elif final_reps >= target_reps:
                status = "success"
            
            # Special case: total failure (0 reps)
            if final_reps == 0:
                status = "failure"

            return {
                "success": True,
                "parsed_set": {
                    "reps": final_reps,
                    "weight": float(final_weight),
                    "status": status
                },
                "error": None
            }
        except Exception as e:
            return {"success": False, "parsed_set": None, "error": str(e)}
