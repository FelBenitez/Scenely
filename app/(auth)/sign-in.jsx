// app/auth/sign-in.jsx
import { useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, Platform, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';

// ----- Small OTP input with 6 boxes -----
function OTPBoxes({ value, onChange, onComplete }) {
  const refs = Array.from({ length: 6 }, () => useRef(null));
  const digits = (value + '______').slice(0, 6).split('');

  const setDigit = (idx, char) => {
    // accept only 0-9
    const c = (char || '').replace(/\D/g, '');
    if (!c) return;

    // handle paste (user pasted full code)
    if (c.length > 1) {
      const clipped = c.slice(0, 6);
      onChange(clipped);
      if (clipped.length === 6) onComplete?.(clipped);
      refs[5].current?.blur();
      return;
    }

    const next = value.split('');
    next[idx] = c;
    const joined = next.join('').slice(0, 6);
    onChange(joined);

    if (idx < 5) refs[idx + 1].current?.focus();
    if (joined.length === 6) onComplete?.(joined);
  };

  const onKeyPress = (idx, e) => {
    if (e.nativeEvent.key === 'Backspace') {
      if (value[idx]) {
        // clear current digit
        const next = value.split('');
        next[idx] = '';
        onChange(next.join(''));
        return;
      }
      if (idx > 0) {
        refs[idx - 1].current?.focus();
        const next = value.split('');
        next[idx - 1] = '';
        onChange(next.join(''));
      }
    }
  };

  return (
    <View style={styles.otpRow}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={refs[i]}
          value={value[i] ?? ''}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={(e) => onKeyPress(i, e)}
          keyboardType="number-pad"
          returnKeyType="done"
          maxLength={1}
          autoCorrect={false}
          autoCapitalize="none"
          textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
          autoComplete={Platform.select({ ios: 'one-time-code', android: 'sms-otp' })}
          style={styles.otpCell}
        />
      ))}
    </View>
  );
}

export default function SignIn() {
  const [step, setStep] = useState('email'); // 'email' | 'code'
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const sendCode = async () => {
    const ok = /@.*utexas\.edu$/i.test(email.trim());
    if (!ok) return Alert.alert('UT email required', 'Use your @utexas.edu address.');

    try {
      setSending(true);
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true },
      });
      if (error) throw error;
      setStep('code');
      Alert.alert('Check your inbox', 'Enter the 6-digit code we emailed you.');
    } catch (e) {
      Alert.alert('Couldn’t send code', e.message ?? 'Try again.');
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (maybeCode) => {
    const token = (maybeCode || code).trim();
    if (token.length !== 6) return;

    try {
      setVerifying(true);
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token,
        type: 'email',
      });
      if (error) throw error;
      // success → session listener in _layout routes to (tabs)
    } catch (e) {
      Alert.alert('Invalid or expired code', 'Request a new code and try again.');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
      <Text style={{ fontSize: 28, fontWeight: '800', marginBottom: 16 }}>Welcome to Scenely</Text>

      {step === 'email' ? (
        <>
          <TextInput
            placeholder="you@utexas.edu"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={styles.emailInput}
          />
          <TouchableOpacity
            onPress={sendCode}
            disabled={sending}
            style={[styles.primaryBtn, sending && { opacity: 0.6 }]}
          >
            <Text style={styles.primaryText}>{sending ? 'Sending…' : 'Send Code'}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={{ marginBottom: 8, color: '#555' }}>Enter the 6-digit code</Text>
          <OTPBoxes
            value={code}
            onChange={setCode}
            onComplete={(c) => verifyCode(c)}
          />
          <TouchableOpacity
            onPress={() => verifyCode()}
            disabled={verifying || code.length !== 6}
            style={[styles.primaryBtn, (verifying || code.length !== 6) && { opacity: 0.6 }]}
          >
            <Text style={styles.primaryText}>{verifying ? 'Verifying…' : 'Verify & Continue'}</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setStep('email')} style={{ marginTop: 12 }}>
            <Text style={{ textAlign: 'center' }}>Use a different email</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emailInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14,
  },
  primaryBtn: {
    marginTop: 12, padding: 14, backgroundColor: '#b65a26', borderRadius: 12,
  },
  primaryText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  otpRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 12,
  },
  otpCell: {
    width: 48, height: 56, borderWidth: 1.5, borderColor: '#ddd', borderRadius: 10,
    textAlign: 'center', fontSize: 20, fontWeight: '700',
  },
});