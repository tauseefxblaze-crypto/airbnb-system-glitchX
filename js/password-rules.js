/* StayNest - account rules shared by the browser (live hints) and the server (the real check).
   The browser copy is only for speed; server.js runs the same rules again on every request. */
(function (root) {
  'use strict';

  var MIN_LENGTH = 8;
  var MAX_BYTES = 72; // bcrypt ignores anything after 72 bytes
  var USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // shortcut: a short built-in list, upgrade to a breached-password check (e.g. Have I Been Pwned) for real users
  var COMMON = ('password passw0rd password1 123456 1234567 12345678 123456789 1234567890 987654321 87654321 ' +
    '11111111 00000000 12341234 11223344 qwerty qwertyui qwertyuiop qwerty123 asdfghjk asdfghjkl zxcvbnm ' +
    '1q2w3e4r 1qaz2wsx zaq12wsx abc123 abcd1234 abcdefg abcdefgh letmein welcome iloveyou admin administrator ' +
    'monkey dragon football baseball cricket sunshine princess master shadow superman batman trustno1 ' +
    'starwars whatever freedom computer michael jennifer hello charlie login changeme secret default ' +
    'qazwsx mustang access flower hunter ranger soccer hockey killer pepper ginger summer winter ' +
    'pakistan lahore karachi islamabad peshawar quetta hunza staynest airbnb glitchx glitchxstudio ' +
    'bismillah allahakbar mashallah internet samsung google facebook instagram').split(' ');
  var COMMON_SET = {};
  COMMON.forEach(function (w) { COMMON_SET[w] = true; });

  function byteLength(text) {
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(text).length : unescape(encodeURIComponent(text)).length;
  }

  function isCommon(lower) {
    // "Password123!" and "p@ssw0rd" are still "password"
    var core = lower.replace(/^[^a-z]+|[^a-z]+$/g, '');
    var plain = lower.replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a')
      .replace(/[5$]/g, 's').replace(/7/g, 't').replace(/[^a-z]/g, '');
    return COMMON_SET[lower] || COMMON_SET[core] || COMMON_SET[plain] ||
      COMMON_SET[plain.replace(/i/g, 'l')] || false;
  }

  function distinctChars(text) {
    var seen = {};
    var count = 0;
    for (var i = 0; i < text.length; i++) if (!seen[text[i]]) { seen[text[i]] = true; count++; }
    return count;
  }

  /* Returns { level: 'bad' | 'good' | 'strong', reason } - reason explains a 'bad' result. */
  function strength(password, context) {
    var pw = String(password || '');
    var lower = pw.toLowerCase();
    if (pw.length < MIN_LENGTH) return { level: 'bad', reason: 'Use at least ' + MIN_LENGTH + ' characters.' };
    if (isCommon(lower)) return { level: 'bad', reason: 'This is a very common password. Pick something only you would know.' };

    var ctx = context || {};
    var personal = [ctx.username, String(ctx.email || '').split('@')[0]];
    for (var i = 0; i < personal.length; i++) {
      var bit = String(personal[i] || '').toLowerCase();
      if (bit.length >= 3 && lower.indexOf(bit) !== -1) {
        return { level: 'bad', reason: "Don't use your username or email in your password." };
      }
    }

    var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (re) { return re.test(pw); }).length;
    if (distinctChars(pw) < 5 || (kinds === 1 && pw.length < 16)) {
      return { level: 'bad', reason: 'Too easy to guess. Make it longer or mix in capitals, numbers and symbols.' };
    }
    if ((pw.length >= 12 && kinds >= 3) || (pw.length >= 20 && kinds >= 2)) return { level: 'strong', reason: '' };
    return { level: 'good', reason: '' };
  }

  /* Each check returns '' when the value is fine, otherwise a message for the user. */
  function passwordProblem(password, context) {
    var pw = String(password || '');
    if (!pw) return 'Choose a password.';
    if (byteLength(pw) > MAX_BYTES) return 'Use ' + MAX_BYTES + ' characters or fewer.';
    var result = strength(pw, context);
    return result.level === 'bad' ? result.reason : '';
  }

  function usernameProblem(username) {
    var name = String(username || '');
    if (!name) return 'Choose a username.';
    return USERNAME_RE.test(name) ? '' : 'Use 3-20 letters, numbers or underscores (no spaces).';
  }

  function emailProblem(email) {
    var value = String(email || '');
    if (!value) return 'Enter your email.';
    return value.length <= 254 && EMAIL_RE.test(value) ? '' : 'Enter a valid email, like name@example.com.';
  }

  var api = {
    MIN_LENGTH: MIN_LENGTH,
    strength: strength,
    passwordProblem: passwordProblem,
    usernameProblem: usernameProblem,
    emailProblem: emailProblem
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SNRules = api;
})(this);
