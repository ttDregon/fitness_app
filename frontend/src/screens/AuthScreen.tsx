import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, ScrollView, LayoutAnimation } from 'react-native';
import { ScrollPicker } from '../components/ScrollPicker';
import { GradientButton } from '../components/Gradient';
import { ageData, heightWholeData, weightWholeData, decimalsData } from '../utils/pickers';
import { styles } from '../styles';
import { COLORS, GRADIENTS } from '../theme';
import { useApp } from '../context/AppContext';

type QuizRole = 'client' | 'trainer';

// Вопросы квиза "Тренер или Пользователь?". Каждый ответ добавляет очки к
// склонности "тренер"; итог 0-2 → Пользователь, 3-6 → Тренер (см. quiz_result).
const QUIZ_QUESTIONS: { title: string; question: string; answers: { label: string; score: number }[] }[] = [
  {
    title: 'Тренер или Пользователь?',
    question: 'Что тебе ближе?',
    answers: [
      { label: '🏋️ Я тренируюсь сам(а)', score: 0 },
      { label: '👥 Я веду других людей', score: 2 },
    ],
  },
  {
    title: 'Ещё один вопрос',
    question: 'Как ты обычно работаешь с планом тренировок?',
    answers: [
      { label: '📋 Слежу за своим прогрессом и чек-листом', score: 0 },
      { label: '🤝 И то, и другое — тренируюсь сам(а) и веду группу', score: 1 },
      { label: '📤 Составляю и назначаю программы клиентам', score: 2 },
    ],
  },
  {
    title: 'Последнее',
    question: 'Что важнее прямо сейчас?',
    answers: [
      { label: '🎯 Достигать своей цели по весу/форме', score: 0 },
      { label: '📊 Видеть прогресс своих клиентов и назначать им планы/питание', score: 2 },
    ],
  },
];

const ROLE_INFO: Record<QuizRole, { title: string; desc: string }> = {
  trainer: {
    title: 'Тренер',
    desc: 'Тренер может: создавать клубы, добавлять клиентов, назначать им тренировки и питание, следить за их прогрессом. Личный дневник тренировок и питания тоже остаётся доступен.',
  },
  client: {
    title: 'Пользователь',
    desc: 'Пользователь ведёт свой дневник тренировок и питания, ставит цели по весу, общается с ИИ-ассистентом и может вступить в клуб тренера по коду.',
  },
};

export default function AuthScreen() {
  const {
    authMode, setAuthMode, email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
    name, setName, isLoadingAuth, handleLogin, smoothStateUpdate, setUserRole,
    handleCredentialsNext, handleGoalNext, workoutsPerWeek, setWorkoutsPerWeek, goal,
    userGender, setUserGender, userAge, setUserAge,
    userHeightWhole, setUserHeightWhole, userHeightDec, setUserHeightDec,
    userWeightWhole, setUserWeightWhole, userWeightDec, setUserWeightDec,
    targetWeightWhole, setTargetWeightWhole, targetWeightDec, setTargetWeightDec,
    handleFinalRegister,
  } = useApp();

  // Локальный прогресс квиза — не нужен нигде за пределами этого экрана.
  const [quizStep, setQuizStep] = React.useState(0);
  const [quizScore, setQuizScore] = React.useState(0);
  const [quizSuggestedRole, setQuizSuggestedRole] = React.useState<QuizRole>('client');
  // Куда вернуться кнопкой "Назад" с экрана register_credentials.
  const [roleSourceScreen, setRoleSourceScreen] = React.useState<'quiz_result' | 'role_select'>('quiz_result');

  const goQuiz = (mode: string) => { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setAuthMode(mode); };

  const answerQuiz = (score: number) => {
    const total = quizScore + score;
    if (quizStep < QUIZ_QUESTIONS.length - 1) {
      setQuizScore(total);
      setQuizStep(quizStep + 1);
      goQuiz(`quiz_q${quizStep + 2}`);
    } else {
      setQuizSuggestedRole(total >= 3 ? 'trainer' : 'client');
      setQuizScore(0);
      setQuizStep(0);
      goQuiz('quiz_result');
    }
  };

  const pickRole = (role: QuizRole, source: 'quiz_result' | 'role_select') => {
    setRoleSourceScreen(source);
    smoothStateUpdate(() => { setUserRole(role); setAuthMode('register_credentials'); });
  };

  if (authMode === 'login') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Striva</Text>
        <Text style={styles.subtitle}>Вход в систему</Text>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={COLORS.textSecondary} value={email} onChangeText={setEmail} autoCapitalize="none" />
        <TextInput style={styles.input} placeholder="Пароль" placeholderTextColor={COLORS.textSecondary} secureTextEntry value={password} onChangeText={setPassword} />
        <GradientButton colors={GRADIENTS.primary} style={styles.button} onPress={handleLogin} disabled={isLoadingAuth}>
          {isLoadingAuth ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Войти</Text>}
        </GradientButton>
        <TouchableOpacity onPress={() => goQuiz('quiz_q1')} style={{marginTop: 30}}>
          <Text style={styles.linkText}>Нет аккаунта? Зарегистрироваться</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (authMode.startsWith('quiz_q')) {
    const idx = Number(authMode.replace('quiz_q', '')) - 1;
    const q = QUIZ_QUESTIONS[idx];
    if (!q) return null;
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>{q.title}</Text>
        <Text style={styles.subtitle}>Ответь на пару вопросов — подберём подходящую роль.</Text>
        <Text style={[styles.label, {textAlign: 'center', width: '100%', marginBottom: 16, marginTop: 6}]}>{q.question}</Text>
        {q.answers.map((a, i) => (
          <TouchableOpacity key={i} style={styles.wizardOptionBtn} onPress={() => answerQuiz(a.score)}>
            <Text style={styles.wizardOptionText}>{a.label}</Text>
          </TouchableOpacity>
        ))}
        {idx === 0 && (
          <TouchableOpacity onPress={() => goQuiz('role_select')} style={{marginTop: 20}}>
            <Text style={styles.linkText}>Уже знаю свою роль → выбрать вручную</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => goQuiz(idx === 0 ? 'login' : `quiz_q${idx}`)} style={styles.backButton}><Text style={styles.backButtonText}>← Назад</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'quiz_result') {
    const info = ROLE_INFO[quizSuggestedRole];
    const other: QuizRole = quizSuggestedRole === 'trainer' ? 'client' : 'trainer';
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Похоже, тебе подходит роль «{info.title}»</Text>
        <Text style={[styles.subtitle, {marginBottom: 24}]}>{info.desc}</Text>
        <GradientButton colors={GRADIENTS.violetIndigo} style={styles.button} onPress={() => pickRole(quizSuggestedRole, 'quiz_result')}>
          <Text style={styles.buttonText}>Продолжить как {info.title.toLowerCase()}</Text>
        </GradientButton>
        <TouchableOpacity onPress={() => pickRole(other, 'quiz_result')} style={{marginTop: 16}}>
          <Text style={styles.linkText}>Выбрать другую роль ({ROLE_INFO[other].title.toLowerCase()})</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => goQuiz('quiz_q1')} style={styles.backButton}><Text style={styles.backButtonText}>← Пройти квиз заново</Text></TouchableOpacity>
      </View>
    );
  }
  if (authMode === 'role_select') {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>Новый аккаунт</Text>
        <Text style={styles.subtitle}>Выберите свою роль</Text>
        <GradientButton colors={GRADIENTS.violetIndigo} style={styles.choiceButton} onPress={() => pickRole('client', 'role_select')}><Text style={styles.buttonText}>Я Клиент</Text><Text style={styles.subText}>Тренируюсь по плану</Text></GradientButton>
        <TouchableOpacity style={[styles.choiceButton, {backgroundColor: COLORS.cardAlt, borderWidth: 1, borderColor: 'rgba(251, 113, 133, 0.4)'}]} onPress={() => pickRole('trainer', 'role_select')}><Text style={[styles.buttonText, {color: COLORS.textPrimary}]}>Я Тренер</Text><Text style={[styles.subText, {color: COLORS.textSecondary}]}>Веду клиентов</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => goQuiz('quiz_q1')} style={styles.backButton}><Text style={styles.backButtonText}>← Вернуться к квизу</Text></TouchableOpacity>
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
        <TouchableOpacity onPress={() => { smoothStateUpdate(() => setAuthMode(roleSourceScreen)); }} style={styles.backButton}><Text style={styles.backButtonText}>← К выбору роли</Text></TouchableOpacity>
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
