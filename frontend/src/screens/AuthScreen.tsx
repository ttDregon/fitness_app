import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, LayoutAnimation } from 'react-native';
import { ScrollPicker } from '../components/ScrollPicker';
import { GradientButton } from '../components/Gradient';
import { TRAINER_PLANS } from '../config/billing';
import { ageData, heightWholeData, weightWholeData, decimalsData } from '../utils/pickers';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';

export default function AuthScreen() {
  const {
    authMode, setAuthMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
    name, setName, isLoadingAuth, handleLogin, smoothStateUpdate, setUserRole, setPendingTrainerPlan,
    handleCredentialsNext, handleGoalNext, workoutsPerWeek, setWorkoutsPerWeek, goal,
    userGender, setUserGender, userAge, setUserAge,
    userHeightWhole, setUserHeightWhole, userHeightDec, setUserHeightDec,
    userWeightWhole, setUserWeightWhole, userWeightDec, setUserWeightDec,
    targetWeightWhole, setTargetWeightWhole, targetWeightDec, setTargetWeightDec,
    handleFinalRegister,
  } = useApp();

  if (authMode === 'login') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>FitnessApp</Text>
        <Text style={styles.subtitle}>Вход в систему</Text>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry value={password} onChangeText={setPassword} />
        <GradientButton colors={GRADIENTS.primary} style={styles.button} onPress={handleLogin} disabled={isLoadingAuth}>
          {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
        </GradientButton>
        <TouchableOpacity onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAuthMode('role_select'); }} style={{marginTop: 30}}>
          <Text style={styles.linkText}>Нет аккаунта? Зарегистрироваться</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'role_select') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Новый аккаунт</Text>
        <Text style={styles.subtitle}>Выберите свою роль</Text>
        <GradientButton colors={GRADIENTS.violetIndigo} style={styles.choiceButton} onPress={() => { smoothStateUpdate(() => { setUserRole('client'); setAuthMode('register_credentials'); }); }}><Text style={styles.buttonText}>Я Клиент</Text><Text style={styles.subText}>Тренируюсь по плану</Text></GradientButton>
        <TouchableOpacity style={[styles.choiceButton, {backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: 'rgba(251, 113, 133, 0.4)'}]} onPress={() => { smoothStateUpdate(() => { setUserRole('trainer'); setAuthMode('trainer_intro'); }); }}><Text style={[styles.buttonText, {color: COLORS.textPrimary}]}>Я Тренер</Text><Text style={[styles.subText, {color: COLORS.textSecondary}]}>Веду клиентов · по подписке</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('login')); }} style={styles.backButton}><Text style={styles.backButtonText}>← Вернуться ко входу</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'trainer_intro') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Подписка «Тренер»</Text>
        <Text style={styles.subtitle}>Выберите тариф — оплата в Telegram откроется сразу после регистрации.</Text>
        {TRAINER_PLANS.map(p => (
          <TouchableOpacity
            key={p.id}
            activeOpacity={0.85}
            onPress={() => { smoothStateUpdate(() => { setPendingTrainerPlan(p.id); setAuthMode('register_credentials'); }); }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(251,113,133,0.3)' }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ color: COLORS.textPrimary, fontSize: 16, fontWeight: '800' }}>{p.label}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 3 }}>Выбрать и оплатить после регистрации →</Text>
            </View>
            <Text style={{ color: COLORS.rose, fontSize: 18, fontWeight: '900' }}>{p.priceUah} грн</Text>
          </TouchableOpacity>
        ))}
        <Text style={{ color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 14, lineHeight: 19 }}>
          Без подписки тренерские функции закрыты, но аккаунт и личные функции доступны.
        </Text>
        <GradientButton colors={GRADIENTS.rose} style={styles.button} onPress={() => { smoothStateUpdate(() => setAuthMode('register_credentials')); }}>
          <Text style={styles.buttonText}>Продолжить без подписки →</Text>
        </GradientButton>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('role_select')); }} style={styles.backButton}><Text style={styles.backButtonText}>← Назад к выбору роли</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'register_credentials') {
    const passwordsMatch = password === confirmPassword || confirmPassword === '';
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Регистрация</Text>
        <TextInput style={styles.input} placeholder="Ваше Имя / Никнейм" placeholderTextColor={COLORS.textSecondary} value={name} onChangeText={setName} />
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry value={password} onChangeText={setPassword} />
        <TextInput style={[styles.input, !passwordsMatch && styles.inputError]} placeholderTextColor={COLORS.textSecondary} placeholder="Подтвердите пароль" secureTextEntry value={confirmPassword} onChangeText={setConfirmPassword} />
        <GradientButton colors={GRADIENTS.primary} style={[styles.button, {marginTop: 15}]} onPress={handleCredentialsNext} disabled={isLoadingAuth || !passwordsMatch}>
          {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Далее →</Text>}
        </GradientButton>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('role_select')); }} style={styles.backButton}><Text style={styles.backButtonText}>← К выбору роли</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'register_goal') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Какая у вас цель?</Text>
        <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('lose')}><Text style={styles.wizardOptionText}>🔥 Похудеть</Text></TouchableOpacity>
        <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('gain')}><Text style={styles.wizardOptionText}>💪 Набрать массу</Text></TouchableOpacity>
        <TouchableOpacity style={styles.wizardOptionBtn} onPress={() => handleGoalNext('maintain')}><Text style={styles.wizardOptionText}>⚖️ Поддерживать вес</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('register_credentials')); }} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'register_target_weight') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Цель в цифрах</Text>
        <Text style={[styles.label, {textAlign: 'center', width: '100%', marginBottom: 20}]}>Укажите желаемый вес (кг):</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.card, padding: 20, borderRadius: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          <ScrollPicker items={weightWholeData} selectedValue={targetWeightWhole} onValueChange={(val: string | number) => setTargetWeightWhole(val as number)} width={80} textColor={COLORS.textPrimary} />
          <Text style={{fontSize: 34, fontWeight: '800', marginHorizontal: 5, color: COLORS.tabBar}}>.</Text>
          <ScrollPicker items={decimalsData} selectedValue={targetWeightDec} onValueChange={(val: string | number) => setTargetWeightDec(val as string)} width={80} textColor={COLORS.textPrimary} />
        </View>
        <GradientButton colors={GRADIENTS.primary} style={[styles.button, {marginTop: 15}]} onPress={() => { smoothStateUpdate(() => setAuthMode('register_frequency')); }}><Text style={styles.buttonText}>Далее →</Text></GradientButton>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('register_goal')); }} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'register_frequency') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Частота тренировок</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25, marginTop: 10}}>
          <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '1-2' && styles.wizardSquareBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setWorkoutsPerWeek('1-2'); }}><Text style={[styles.wizardSquareText, workoutsPerWeek === '1-2' && {color: '#fff'}]}>1-2</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '3-4' && styles.wizardSquareBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setWorkoutsPerWeek('3-4'); }}><Text style={[styles.wizardSquareText, workoutsPerWeek === '3-4' && {color: '#fff'}]}>3-4</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.wizardSquareBtn, workoutsPerWeek === '5+' && styles.wizardSquareBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setWorkoutsPerWeek('5+'); }}><Text style={[styles.wizardSquareText, workoutsPerWeek === '5+' && {color: '#fff'}]}>5+</Text></TouchableOpacity>
        </View>
        <GradientButton colors={GRADIENTS.primary} style={[styles.button, {marginTop: 10}]} onPress={() => { smoothStateUpdate(() => setAuthMode('register_metrics')); }} disabled={!workoutsPerWeek}><Text style={styles.buttonText}>Далее →</Text></GradientButton>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode(goal === 'maintain' ? 'register_goal' : 'register_target_weight')); }} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'register_metrics') {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}>
        <Text style={styles.title}>О вас</Text>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, marginTop: 15}}>
          <TouchableOpacity style={[styles.wizardGenderBtn, userGender === 'male' && styles.wizardGenderBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setUserGender('male'); }}><Text style={[styles.wizardGenderText, userGender === 'male' && {color: '#fff'}]}>Мужчина</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.wizardGenderBtn, userGender === 'female' && styles.wizardGenderBtnActive]} onPress={() => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setUserGender('female'); }}><Text style={[styles.wizardGenderText, userGender === 'female' && {color: '#fff'}]}>Женщина</Text></TouchableOpacity>
        </View>
        <View style={{ backgroundColor: COLORS.card, padding: 20, borderRadius: 24, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={styles.label}>Возраст (лет)</Text>
          <View style={{alignItems: 'center'}}><ScrollPicker items={ageData} selectedValue={userAge} onValueChange={(val: string | number) => setUserAge(val as number)} width={120} textColor={COLORS.textPrimary} /></View>
        </View>
        <View style={{ backgroundColor: COLORS.card, padding: 20, borderRadius: 24, marginBottom: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={styles.label}>Рост (см)</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
            <ScrollPicker items={heightWholeData} selectedValue={userHeightWhole} onValueChange={(val: string | number) => setUserHeightWhole(val as number)} width={80} textColor={COLORS.textPrimary} />
            <Text style={{fontSize: 34, fontWeight: '800', marginHorizontal: 5, color: COLORS.tabBar}}>.</Text>
            <ScrollPicker items={decimalsData} selectedValue={userHeightDec} onValueChange={(val: string | number) => setUserHeightDec(val as string)} width={80} textColor={COLORS.textPrimary} />
          </View>
        </View>
        <View style={{ backgroundColor: COLORS.card, padding: 20, borderRadius: 24, marginBottom: 25, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
          <Text style={styles.label}>Вес (кг)</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }}>
            <ScrollPicker items={weightWholeData} selectedValue={userWeightWhole} onValueChange={(val: string | number) => setUserWeightWhole(val as number)} width={80} textColor={COLORS.textPrimary} />
            <Text style={{fontSize: 34, fontWeight: '800', marginHorizontal: 5, color: COLORS.tabBar}}>.</Text>
            <ScrollPicker items={decimalsData} selectedValue={userWeightDec} onValueChange={(val: string | number) => setUserWeightDec(val as string)} width={80} textColor={COLORS.textPrimary} />
          </View>
        </View>
        <GradientButton colors={GRADIENTS.violetPink} style={[styles.button, {marginTop: 10}]} onPress={handleFinalRegister} disabled={isLoadingAuth || !userGender}>
          {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Завершить регистрацию</Text>}
        </GradientButton>
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode('register_frequency')); }} style={[styles.backButton, {marginBottom: 40}]}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
      </ScrollView>
    );
  }

  return null;
}
