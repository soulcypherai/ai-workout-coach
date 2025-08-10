/**
 * Detect if a message contains self-references
 * Returns true if the user is referring to themselves, their appearance, clothing, etc.
 */
export function containsSelfReference(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // Self-reference patterns
  const selfPatterns = [
    // Direct self-references
    /\b(i|me|my|myself|mine)\b/,
    /\b(i'm|i am|i've|i have|i'll|i will)\b/,
    /\b(how do i look|do i look|what do you think of me)\b/,
    
    // Appearance references
    /\b(my (outfit|clothes|clothing|shirt|pants|dress|shoes|hat|glasses|hair|face|look|style))\b/,
    /\b(wearing|dressed|look like|appear)\b.*\b(i|me|my)\b/,
    /\b(i|me|my)\b.*\b(wearing|dressed|look like|appear)\b/,
    
    // Body/fitness references
    /\b(my (form|posture|body|muscles|physique|stance|position))\b/,
    /\b(am i doing|how am i doing|check my)\b/,
    
    // Questions about self
    /\b(can you see me|do you see me|what do you see)\b/,
    /\b(rate my|judge my|evaluate my|analyze my|critique my)\b/,
    /\b(how's my|hows my|what about my)\b/,
    
    // This/these when likely referring to self
    /\b(this|these)\b.*\b(outfit|shirt|pants|dress|clothes|look)\b/,
    /\b(rate this|check this out|what do you think of this)\b/
  ];
  
  // Check if any pattern matches
  return selfPatterns.some(pattern => pattern.test(lowerText));
}

/**
 * Extract the type of self-reference for context
 */
export function getSelfReferenceType(text: string): 'appearance' | 'fitness' | 'general' | null {
  if (!containsSelfReference(text)) return null;
  
  const lowerText = text.toLowerCase();
  
  // Check for appearance-related references
  if (/\b(outfit|clothes|clothing|shirt|pants|dress|shoes|hat|glasses|hair|style|wearing|look)\b/.test(lowerText)) {
    return 'appearance';
  }
  
  // Check for fitness-related references
  if (/\b(form|posture|body|muscles|physique|stance|position|exercise|workout|rep)\b/.test(lowerText)) {
    return 'fitness';
  }
  
  return 'general';
}