import React, { useState, useRef } from "react";
import { useDispatch } from "react-redux";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import toast, { Toaster } from "react-hot-toast";
import * as z from "zod";

import AuthLayout from "../components/ui/AuthLayout";
import AuthHeader from "../components/ui/AuthHeader";
import AuthButton from "../components/ui/AuthButton";

import { addUser } from "../utils/userSlice";
import useValidation from "../hooks/useFormDataValidator";
import { BASE_URL } from "../utils/constant";

export default function SignUp() {
  const fullName = useRef();
  const username = useRef();
  const email = useRef();
  const password = useRef();

  const dispatch = useDispatch();

  const [loading, setLoading] = useState(false);
  const { errors, validate } = useValidation();

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    toast.loading("Signing up...");
    setLoading(true);

    const data = {
      name: fullName.current.value,
      username: username.current.value,
      email: email.current.value,
      password: password.current.value,
    };

    const Data = z.object({
      name: z.string(),
      username: z.string(),
      email: z.email(),
      password: z.string()
    });

    const result = Data.parse(data);
    console.log('it is comming from zod',result);

    if (!validate(data)) {
      toast.dismiss();
      return;
    }
    const response = await fetch(`${BASE_URL}/api/v1/user/signup`, {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const user = await response.json();
    toast.dismiss();

    if (user.error) {
      toast.error("Error Signing up !!!");
      setError(user.error);
    } else {
      toast.success("User created. Please Login to continue...");
      dispatch(addUser(user.data));
    }

    setTimeout(() => {
      navigate("/login");
      setLoading(false);
    }, 1500);

    // Simulate API call
  };

  return (
    <AuthLayout imageSide="left">
      <Toaster />
      <AuthHeader
        title="Create an account"
        description="Enter your details to get started"
      />
      <form onSubmit={handleSubmit} className="space-y-6">
        <label className=" text-sm font-medium text-foreground">
          Full Name
        </label>
        <div>
          <input
            type="text"
            placeholder="Ben Ten"
            ref={fullName}
            className="block w-full rounded-md border border-input bg-background px-4 py-3 text-foreground shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {errors && (
            <span className="pt-4 text-red-500 text-sm italic">
              {errors.name}
            </span>
          )}
        </div>

        <label className=" text-sm font-medium text-foreground">Username</label>
        <div>
          <input
            type="text"
            placeholder="ben_ten"
            ref={username}
            className="block w-full rounded-md border border-input bg-background px-4 py-3 text-foreground shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {errors && (
            <span className="pt-4 text-red-500 text-sm italic">
              {errors.username}
            </span>
          )}
        </div>

        <label className=" text-sm font-medium text-foreground">Email</label>
        <div>
          <input
            type="email"
            placeholder="ben@gmail.com"
            ref={email}
            className="block w-full rounded-md border border-input bg-background px-4 py-3 text-foreground shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {errors && (
            <span className="pt-4 text-red-500 text-sm italic">
              {errors.email}
            </span>
          )}
        </div>

        <label className=" text-sm font-medium text-foreground">Password</label>
        <div>
          <input
            type="password"
            placeholder="......."
            ref={password}
            className=" w-full rounded-md border border-input bg-background px-4 py-3 text-foreground shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
          {errors && (
            <span className="pt-4 text-red-500 text-sm italic">
              {errors.password}
            </span>
          )}
        </div>

        <AuthButton type="submit" className="w-full" delay={5}>
          Create Account
        </AuthButton>
      </form>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="mt-6 text-center"
      >
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-primary hover:text-primary/90 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </motion.div>
    </AuthLayout>
  );
}
