import { useState } from 'react'
import FormWrapper from './FormWrapper'
import { FormHeader } from './FormHeader'
import { InputField } from "./InputField"
import { SubmitButton } from "./SubmitButton"

interface SignInFormProps {
	onSwitchMode: () => void;
}

export default function Guest({ onSwitchMode }: SignInFormProps)
{
	return(
		<FormWrapper>
		<FormHeader title="Join as Guest" subtitle="Come on bro"/>
		<InputField placeholder="Enter your temporary name"/>
		<SubmitButton onClick={onSwitchMode}>
		Join as Guest
		</SubmitButton>
		</FormWrapper>
	);
}
